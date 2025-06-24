// Sync mechanism between VS Code TodoManager and Standalone TodoManager
import { TodoItem } from '../types';

export class TodoSync {
  private vscodeManager: any;
  private standaloneManager: any;
  private syncDisposable: any;
  private isSyncing: boolean = false;
  private lastSyncHash: string | null = null;
  private syncDebounceTimer: NodeJS.Timeout | undefined;
  private syncVersion: number = 0;
  private syncPromise: Promise<void> | null = null;
  private syncDirection: 'vscode-to-standalone' | 'standalone-to-vscode' | null = null;
  private externalChangeFlag: boolean = false;

  constructor(vscodeManager: any, standaloneManager: any) {
    this.vscodeManager = vscodeManager;
    this.standaloneManager = standaloneManager;

    console.log('[TodoSync] Initializing bidirectional sync');

    // Setup bidirectional sync first to capture all events
    this.setupSync();

    // Initial sync from VS Code to standalone after event handlers are set up
    // Use immediate to ensure it happens after constructor completes
    setImmediate(() => {
      this.syncToStandalone();
    });
  }

  public markExternalChange(): void {
    console.log('[TodoSync] Marking next change as external (MCP-initiated)');
    this.externalChangeFlag = true;
  }

  private async syncToStandalone(): Promise<void> {
    // Skip if we're already syncing in the opposite direction to prevent echo
    if (this.syncDirection === 'standalone-to-vscode') {
      console.log('[TodoSync] Skipping sync to standalone - already syncing from standalone');
      return;
    }

    // If a sync is already in progress, wait for it to complete
    if (this.syncPromise) {
      console.log('[TodoSync] Sync already in progress, waiting for completion');
      await this.syncPromise;
    }

    const todos = this.vscodeManager.getTodos();
    const title = this.vscodeManager.getBaseTitle();
    const currentHash = JSON.stringify({ todos, title });

    // Force update on empty transitions
    let isEmptyTransition = false;
    let forceSync = false;

    if (this.lastSyncHash === null) {
      // First sync, always proceed
      forceSync = true;
      console.log('[TodoSync] First sync to standalone');
    } else {
      try {
        const lastData = JSON.parse(this.lastSyncHash);
        const lastTodoCount = lastData.todos?.length || 0;
        const currentTodoCount = todos.length;
        isEmptyTransition = (lastTodoCount > 0 && currentTodoCount === 0) ||
          (lastTodoCount === 0 && currentTodoCount > 0);
        if (isEmptyTransition) {
          console.log(`[TodoSync] Empty transition detected: ${lastTodoCount} -> ${currentTodoCount} (forced sync)`);
          forceSync = true; // Always force sync on empty transitions
        }
      } catch (e) {
        // If we can't parse last hash, force sync
        forceSync = true;
      }
    }

    // Skip if data hasn't changed (unless it's an empty transition or forced)
    if (currentHash === this.lastSyncHash && !isEmptyTransition && !forceSync) {
      console.log('[TodoSync] No changes detected, skipping sync to standalone');
      return;
    }

    this.isSyncing = true;
    this.syncVersion++;
    const currentVersion = this.syncVersion;
    this.syncDirection = 'vscode-to-standalone';

    // Create a promise for this sync operation
    this.syncPromise = (async () => {
      try {
        console.log(`[TodoSync] Starting sync to Standalone (v${currentVersion})`);
        console.log(`[TodoSync] Data: ${todos.length} todos, title: "${title}", empty transition: ${isEmptyTransition}`);
        await this.standaloneManager.updateTodos(todos, title);
        this.lastSyncHash = currentHash;
        console.log(`[TodoSync] Completed sync to Standalone (v${currentVersion})`);
      } catch (error) {
        console.error(`[TodoSync] Error syncing to standalone (v${currentVersion}):`, error);
      } finally {
        // Only reset if this is still the current sync operation
        if (currentVersion === this.syncVersion) {
          this.isSyncing = false;
          this.syncPromise = null;
          this.syncDirection = null;
          console.log(`[TodoSync] Reset sync flags and promise (v${currentVersion})`);
        }
      }
    })();

    await this.syncPromise;
  }

  private async syncToVSCode(): Promise<void> {
    // Skip if we're already syncing in the opposite direction to prevent echo
    if (this.syncDirection === 'vscode-to-standalone') {
      console.log('[TodoSync] Skipping sync to VS Code - already syncing from VS Code');
      return;
    }

    // If this is an external change (from MCP tool), proceed with sync
    const isExternalChange = this.externalChangeFlag;
    if (isExternalChange) {
      console.log('[TodoSync] External change detected, proceeding with sync to VS Code');
      this.externalChangeFlag = false; // Reset the flag
    }

    // If a sync is already in progress, wait for it to complete
    if (this.syncPromise) {
      console.log('[TodoSync] Sync already in progress, waiting for completion');
      await this.syncPromise;
    }

    const todos = this.standaloneManager.getTodos();
    const title = this.standaloneManager.getTitle();
    const currentHash = JSON.stringify({ todos, title });

    // Force update on empty transitions
    let isEmptyTransition = false;
    let forceSync = false;

    if (this.lastSyncHash === null) {
      // First sync, always proceed
      forceSync = true;
      console.log('[TodoSync] First sync to VS Code');
    } else {
      try {
        const lastData = JSON.parse(this.lastSyncHash);
        const lastTodoCount = lastData.todos?.length || 0;
        const currentTodoCount = todos.length;
        isEmptyTransition = (lastTodoCount > 0 && currentTodoCount === 0) ||
          (lastTodoCount === 0 && currentTodoCount > 0);
        if (isEmptyTransition) {
          console.log(`[TodoSync] Empty transition detected: ${lastTodoCount} -> ${currentTodoCount} (forced sync)`);
          forceSync = true; // Always force sync on empty transitions
        }
      } catch (e) {
        // If we can't parse last hash, force sync
        forceSync = true;
      }
    }

    // Skip if data hasn't changed (unless it's an empty transition, forced, or external change)
    if (currentHash === this.lastSyncHash && !isEmptyTransition && !forceSync && !isExternalChange) {
      console.log('[TodoSync] No changes detected, skipping sync to VS Code');
      return;
    }

    this.isSyncing = true;
    this.syncVersion++;
    const currentVersion = this.syncVersion;
    this.syncDirection = 'standalone-to-vscode';

    // Create a promise for this sync operation
    this.syncPromise = (async () => {
      try {
        console.log(`[TodoSync] Starting sync to VS Code (v${currentVersion})`);
        console.log(`[TodoSync] Data: ${todos.length} todos, title: "${title}", empty transition: ${isEmptyTransition}, external: ${isExternalChange}`);
        if (this.vscodeManager.setTodos) {
          await this.vscodeManager.setTodos(todos, title);
          this.lastSyncHash = currentHash;
          console.log(`[TodoSync] Completed sync to VS Code (v${currentVersion})`);
        } else {
          console.error('[TodoSync] vscodeManager.setTodos method not found');
        }
      } catch (error) {
        console.error(`[TodoSync] Error syncing to VS Code (v${currentVersion}):`, error);
      } finally {
        // Only reset if this is still the current sync operation
        if (currentVersion === this.syncVersion) {
          this.isSyncing = false;
          this.syncPromise = null;
          this.syncDirection = null;
          console.log(`[TodoSync] Reset sync flags and promise (v${currentVersion})`);
        }
      }
    })();

    await this.syncPromise;
  }

  private setupSync(): void {
    // Use consolidated change event
    this.syncDisposable = this.vscodeManager.onDidChange(() => {
      console.log('[TodoSync] VS Code manager changed');
      this.debouncedSyncToStandalone();
    });

    // Sync from standalone to VS Code
    this.standaloneManager.onDidChange(() => {
      console.log('[TodoSync] Standalone manager changed');
      this.debouncedSyncToVSCode();
    });
  }

  private debouncedSyncToStandalone(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    // Check if this is an empty transition for immediate sync
    const todos = this.vscodeManager.getTodos();
    let isEmptyTransition = false;
    if (this.lastSyncHash) {
      try {
        const lastData = JSON.parse(this.lastSyncHash);
        const lastTodoCount = lastData.todos?.length || 0;
        const currentTodoCount = todos.length;
        isEmptyTransition = (lastTodoCount > 0 && currentTodoCount === 0) ||
          (lastTodoCount === 0 && currentTodoCount > 0);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Immediate sync for empty transitions, minimal delay otherwise
    const delay = isEmptyTransition ? 0 : 10;
    this.syncDebounceTimer = setTimeout(async () => {
      await this.syncToStandalone();
    }, delay);
  }

  private debouncedSyncToVSCode(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    // Check if this is an empty transition for immediate sync
    const todos = this.standaloneManager.getTodos();
    let isEmptyTransition = false;
    if (this.lastSyncHash) {
      try {
        const lastData = JSON.parse(this.lastSyncHash);
        const lastTodoCount = lastData.todos?.length || 0;
        const currentTodoCount = todos.length;
        isEmptyTransition = (lastTodoCount > 0 && currentTodoCount === 0) ||
          (lastTodoCount === 0 && currentTodoCount > 0);
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Immediate sync for empty transitions, minimal delay otherwise
    const delay = isEmptyTransition ? 0 : 10;
    this.syncDebounceTimer = setTimeout(async () => {
      await this.syncToVSCode();
    }, delay);
  }

  dispose(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    if (this.syncDisposable) {
      this.syncDisposable.dispose();
    }
    this.standaloneManager.removeAllListeners();
  }
}