// Sync mechanism between VS Code TodoManager and Standalone TodoManager
import { TodoItem } from '../types';

export class TodoSync {
  private vscodeManager: any;
  private standaloneManager: any;
  private syncDisposable: any;
  private isSyncing: boolean = false;
  private lastSyncHash: string = '';
  private syncDebounceTimer: NodeJS.Timeout | undefined;
  
  constructor(vscodeManager: any, standaloneManager: any) {
    this.vscodeManager = vscodeManager;
    this.standaloneManager = standaloneManager;
    
    console.log('[TodoSync] Initializing bidirectional sync');
    
    // Initial sync from VS Code to standalone
    this.syncToStandalone();
    
    // Setup bidirectional sync
    this.setupSync();
  }
  
  private syncToStandalone(): void {
    if (this.isSyncing) {
      return; // Prevent circular sync
    }
    
    const todos = this.vscodeManager.getTodos();
    const title = this.vscodeManager.getTitle();
    const currentHash = JSON.stringify({ todos, title });
    
    // Skip if data hasn't changed
    if (currentHash === this.lastSyncHash) {
      return;
    }
    
    this.isSyncing = true;
    this.lastSyncHash = currentHash;
    
    try {
      console.log(`[TodoSync] Syncing to Standalone: ${todos.length} todos, title: ${title}`);
      this.standaloneManager.updateTodos(todos, title);
    } catch (error) {
      console.error('[TodoSync] Error syncing to standalone:', error);
    } finally {
      // Reset flag after a short delay to ensure all cascading updates are complete
      setTimeout(() => {
        this.isSyncing = false;
      }, 100);
    }
  }
  
  private syncToVSCode(): void {
    if (this.isSyncing) {
      return; // Prevent circular sync
    }
    
    const todos = this.standaloneManager.getTodos();
    const title = this.standaloneManager.getTitle();
    const currentHash = JSON.stringify({ todos, title });
    
    // Skip if data hasn't changed
    if (currentHash === this.lastSyncHash) {
      return;
    }
    
    this.isSyncing = true;
    this.lastSyncHash = currentHash;
    
    try {
      console.log(`[TodoSync] Syncing to VS Code: ${todos.length} todos, title: ${title}`);
      if (this.vscodeManager.setTodos) {
        this.vscodeManager.setTodos(todos, title);
      } else {
        console.error('[TodoSync] vscodeManager.setTodos method not found');
      }
    } catch (error) {
      console.error('[TodoSync] Error syncing to VS Code:', error);
    } finally {
      // Reset flag after a short delay to ensure all cascading updates are complete
      setTimeout(() => {
        this.isSyncing = false;
      }, 100);
    }
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
    this.syncDebounceTimer = setTimeout(() => {
      this.syncToStandalone();
    }, 50);
  }
  
  private debouncedSyncToVSCode(): void {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }
    this.syncDebounceTimer = setTimeout(() => {
      this.syncToVSCode();
    }, 50);
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