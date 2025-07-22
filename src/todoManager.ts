import * as vscode from 'vscode';
import { TodoItem, SavedTodoList } from './types';
import { CopilotInstructionsManager } from './copilotInstructionsManager';
import { TodoValidator } from './todoValidator';
import { PerformanceMonitor } from './utils/performance';
import { TelemetryManager } from './telemetryManager';
import { generateUniqueSlug } from './utils/slugUtils';
import { WorkspaceStateStorage } from './storage/WorkspaceStateStorage';
import { IExtendedTodoStorage } from './storage/IExtendedTodoStorage';
import { areListsExactMatch } from './utils/listComparison';

export class TodoManager {
    private static instance: TodoManager;
    private todos: TodoItem[] = [];
    private title: string = 'Todos';
    // Saved lists storage for previous todo lists
    private savedLists: Map<string, SavedTodoList> = new Map();
    // Saved list change event emitter for MCP resource updates
    private readonly onSavedListChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onSavedListChange = this.onSavedListChangeEmitter.event;
    // Single consolidated change event for better performance
    private readonly onDidChangeEmitter = new vscode.EventEmitter<{ todos: TodoItem[], title: string }>();
    public readonly onDidChange = this.onDidChangeEmitter.event;
    private readonly onShouldOpenViewEmitter = new vscode.EventEmitter<void>();
    public readonly onShouldOpenView = this.onShouldOpenViewEmitter.event;
    // Add configuration change event emitter
    private readonly onDidChangeConfigurationEmitter = new vscode.EventEmitter<{ autoInject: boolean; autoInjectFilePath: string }>();
    public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;
    private copilotInstructionsManager: CopilotInstructionsManager;
    private configurationDisposable: vscode.Disposable | undefined;
    private context: vscode.ExtensionContext | undefined;
    private storage: IExtendedTodoStorage | undefined;
    private pendingUpdate: { todos?: TodoItem[], title?: string } | null = null;
    private updateInProgress = false;
    private lastUpdateHash: string = '';
    private updateVersion: number = 0;

    private constructor() {
        this.copilotInstructionsManager = CopilotInstructionsManager.getInstance();

        try {
            // Listen for configuration changes
            this.configurationDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
                if (event.affectsConfiguration('agentTodos.autoInject')) {
                    await this.handleAutoInjectSettingChange();
                }
                if (event.affectsConfiguration('agentTodos.collapsedMode')) {
                    // Fire consolidated change to refresh tree view
                    this.fireConsolidatedChange();
                }
                // Broadcast changes for all configuration settings that affect MCP tools
                if (event.affectsConfiguration('agentTodos')) {
                    this.onDidChangeConfigurationEmitter.fire({
                        autoInject: this.isAutoInjectEnabled(),
                        autoInjectFilePath: this.getAutoInjectFilePath()
                    });
                }
            });

        } catch (error) {
            // Running in a context where vscode is not available (e.g., tests or standalone)
            console.log('TodoManager: Running without VS Code context');
        }
    }

    public static getInstance(): TodoManager {
        if (!TodoManager.instance) {
            TodoManager.instance = new TodoManager();
        }
        return TodoManager.instance;
    }

    public async initialize(context?: vscode.ExtensionContext): Promise<void> {
        this.context = context;

        // Create storage instance
        if (context) {
            this.storage = new WorkspaceStateStorage(context);
        }

        // Load todos from storage
        if (context) {
            await this.loadFromStorage();
        }
    }

    private isAutoInjectEnabled(): boolean {
        try {
            return vscode.workspace.getConfiguration('agentTodos').get<boolean>('autoInject', false);
        } catch (error) {
            return false; // Default to false when vscode is not available
        }
    }

    private isAutoOpenViewEnabled(): boolean {
        try {
            const config = vscode.workspace.getConfiguration('agentTodos');
            const value = config.get<boolean>('autoOpenView', true);
            console.log(`[TodoManager] isAutoOpenViewEnabled: ${value}`);
            return value;
        } catch (error) {
            console.log(`[TodoManager] isAutoOpenViewEnabled error: ${error}, defaulting to true`);
            return true; // Default to true when vscode is not available
        }
    }

    public isCollapsedModeEnabled(): boolean {
        try {
            return vscode.workspace.getConfiguration('agentTodos').get<boolean>('collapsedMode', false);
        } catch (error) {
            return false; // Default to false when vscode is not available
        }
    }

    private getAutoInjectFilePath(): string {
        try {
            return vscode.workspace.getConfiguration('agentTodos').get<string>('autoInjectFilePath', '.github/instructions/todos.instructions.md');
        } catch (error) {
            return '.github/instructions/todos.instructions.md'; // Default when vscode is not available
        }
    }

    private async handleAutoInjectSettingChange(): Promise<void> {
        if (this.isAutoInjectEnabled()) {
            // Auto-inject is now enabled, update the instructions file
            await this.copilotInstructionsManager.updateInstructionsWithTodos(this.todos, this.title);
        } else {
            // Auto-inject is disabled, remove the todos from instructions
            await this.copilotInstructionsManager.removeInstructionsTodos();
            // Save current todos to storage
            this.saveToStorage();
        }

        // Broadcast configuration change event
        this.onDidChangeConfigurationEmitter.fire({
            autoInject: this.isAutoInjectEnabled(),
            autoInjectFilePath: this.getAutoInjectFilePath()
        });
    }

    private async updateInstructionsIfNeeded(): Promise<void> {
        if (this.isAutoInjectEnabled() && !this.updateInProgress) {
            await PerformanceMonitor.measure('updateInstructionsIfNeeded', async () => {
                this.updateInProgress = true;
                try {
                    await this.copilotInstructionsManager.updateInstructionsWithTodos(this.todos, this.title);
                } finally {
                    this.updateInProgress = false;
                }
            });
        }
    }


    private areTodosEqual(todos1: TodoItem[], todos2: TodoItem[]): boolean {
        return TodoValidator.areTodosEqual(todos1, todos2);
    }

    private fireConsolidatedChange(): void {
        let previousTodoCount = 0;
        let isEmptyTransition = false;

        try {
            if (this.lastUpdateHash) {
                const previousData = JSON.parse(this.lastUpdateHash);
                previousTodoCount = previousData.todos?.length || 0;
            }
        } catch (e) {
            // Ignore parse errors
        }

        const currentTodoCount = this.todos.length;
        isEmptyTransition = (previousTodoCount > 0 && currentTodoCount === 0) ||
            (previousTodoCount === 0 && currentTodoCount > 0);

        // Include version in hash for forced updates
        const currentHash = JSON.stringify({
            todos: this.todos,
            title: this.title,
            version: isEmptyTransition ? ++this.updateVersion : this.updateVersion
        });

        if (currentHash !== this.lastUpdateHash || isEmptyTransition) {
            console.log(`[TodoManager] Firing change event: ${previousTodoCount} -> ${currentTodoCount} todos, title: "${this.getTitle()}"${isEmptyTransition ? ' (empty transition)' : ''}`);
            this.lastUpdateHash = currentHash;

            // Fire consolidated event only
            this.onDidChangeEmitter.fire({ todos: this.todos, title: this.getTitle() });
        } else {
            console.log('[TodoManager] No change detected, skipping event');
        }
    }

    public getTodos(): TodoItem[] {
        return [...this.todos];
    }

    public getBaseTitle(): string {
        return this.title;
    }

    public getTitle(): string {
        const completedCount = this.todos.filter(todo => todo.status === 'completed').length;
        const totalCount = this.todos.length;

        if (totalCount === 0) {
            // Return empty string only for default title to avoid "Agent TODOs: Todos"
            // Custom titles should still be shown even when empty
            return this.title === 'Todos' ? '' : this.title;
        }

        return `${this.title} (${completedCount}/${totalCount})`;
    }

    public async updateTodos(todos: TodoItem[], title?: string): Promise<void> {
        return this.setTodos(todos, title);
    }

    public async setTitle(title: string): Promise<void> {
        if (title !== this.title) {
            this.title = title;
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
        }
    }

    public async setTodos(todos: TodoItem[], title?: string): Promise<void> {
        await PerformanceMonitor.measure('agentTodos.setTodos', async () => {
            const hadTodos = this.todos.length > 0;
            const previousTodoCount = this.todos.length;
            const previousTodos = [...this.todos]; // Save previous todos for comparison

            console.log(`[TodoManager] Setting todos: ${todos.length} items${title ? `, title: ${title}` : ''}`);

            // Save current list ONLY when title is explicitly changing to a different value
            // This prevents duplicate archives when just updating todo statuses within same project
            if (this.todos.length > 0 && this.title !== 'Todos' && 
                title !== undefined && title !== this.title) {
                const reason = `title change from "${this.title}" to "${title}"`;
                await this.saveCurrentList(reason);
            }

            this.todos = [...todos];
            if (title !== undefined && title !== this.title) {
                this.title = title;
            }
            this.fireConsolidatedChange();

            // Check if we should open the view
            const hasTodos = this.todos.length > 0;
            const todosChanged = previousTodoCount !== this.todos.length || !this.areTodosEqual(previousTodos, todos);
            const autoOpenEnabled = this.isAutoOpenViewEnabled();

            console.log(`[TodoManager] View opening check: autoOpenEnabled=${autoOpenEnabled}, hasTodos=${hasTodos}, todosChanged=${todosChanged}, previousCount=${previousTodoCount}, newCount=${this.todos.length}`);

            if (autoOpenEnabled && hasTodos && todosChanged) {
                console.log('[TodoManager] Firing onShouldOpenView event');
                this.onShouldOpenViewEmitter.fire();
            } else {
                console.log('[TodoManager] Not firing onShouldOpenView event');
            }

            await this.updateInstructionsIfNeeded();
            this.saveToStorage();

            // Send telemetry for todo updates
            try {
                const telemetryManager = TelemetryManager.getInstance();
                if (telemetryManager.isEnabled()) {
                    telemetryManager.sendEvent('todos.updated', {
                        autoOpenEnabled: String(autoOpenEnabled)
                    }, {
                        previousCount: previousTodoCount,
                        newCount: this.todos.length,
                        todosChanged: todosChanged ? 1 : 0
                    });
                }
            } catch (telemetryError) {
                console.error('[TodoManager] Failed to send telemetry:', telemetryError);
            }
        });
    }

    public async clearTodos(): Promise<void> {
        const previousCount = this.todos.length;
        
        this.todos = [];
        this.title = 'Todos'; // Reset title to default
        this.fireConsolidatedChange();
        await this.updateInstructionsIfNeeded();
        this.saveToStorage();

        // Send telemetry
        try {
            const telemetryManager = TelemetryManager.getInstance();
            if (telemetryManager.isEnabled()) {
                telemetryManager.sendEvent('todos.cleared', {}, {
                    clearedCount: previousCount
                });
            }
        } catch (telemetryError) {
            console.error('[TodoManager] Failed to send telemetry:', telemetryError);
        }
    }

    public async deleteTodo(id: string): Promise<void> {
        this.todos = this.todos.filter(t => t.id !== id);
        this.fireConsolidatedChange();
        await this.updateInstructionsIfNeeded();
        this.saveToStorage();
    }

    public async setTodoStatus(id: string, status: 'pending' | 'in_progress' | 'completed'): Promise<void> {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            // Check if trying to set to in_progress when another task is already in progress
            if (status === 'in_progress') {
                const hasInProgress = this.todos.some(t => t.id !== id && t.status === 'in_progress');
                if (hasInProgress) {
                    vscode.window.showWarningMessage('Only one task can be in progress at a time. Please complete the current task first.');
                    return;
                }
            }

            todo.status = status;
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async setTodoPriority(id: string, priority: 'high' | 'medium' | 'low'): Promise<void> {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.priority = priority;
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async toggleTodoStatus(id: string): Promise<void> {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            switch (todo.status) {
                case 'pending':
                    // Check if another task is already in progress
                    const hasInProgress = this.todos.some(t => t.id !== id && t.status === 'in_progress');
                    if (hasInProgress) {
                        // Don't allow multiple in_progress tasks
                        vscode.window.showWarningMessage('Only one task can be in progress at a time. Please complete the current task first.');
                        return;
                    }
                    todo.status = 'in_progress';
                    break;
                case 'in_progress':
                    todo.status = 'completed';
                    break;
                case 'completed':
                    todo.status = 'pending';
                    break;
            }
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    // Details management method
    public async setTodoAdr(todoId: string, adr: string | undefined): Promise<void> {
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            const sanitizedAdr = TodoValidator.sanitizeAdr(adr);
            if (sanitizedAdr === undefined) {
                delete todo.adr;
            } else {
                todo.adr = sanitizedAdr;
            }
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    private saveToStorage(): void {

        if (!this.context) {
            console.warn('[TodoManager] Cannot save to storage: context not initialized');
            return;
        }

        const storageData = {
            todos: this.todos,
            title: this.title
        };

        try {
            this.context.workspaceState.update('agentTodos.todos', storageData);
            console.log('[TodoManager] Saved todos to workspace storage');
        } catch (error) {
            console.error('[TodoManager] Failed to save to storage:', error);
        }
    }

    private async saveSavedListsToStorage(): Promise<void> {
        if (!this.storage) {
            console.warn('[TodoManager] Cannot save saved lists to storage: storage not initialized');
            return;
        }

        try {
            const savedListsArray = Array.from(this.savedLists.values());
            await this.storage.saveSavedLists(savedListsArray);
            console.log(`[TodoManager] Saved ${savedListsArray.length} saved lists to storage`);
        } catch (error) {
            console.error('[TodoManager] Failed to save saved lists to storage:', error);
        }
    }

    private async loadSavedListsFromStorage(): Promise<void> {
        if (!this.storage) {
            return;
        }

        try {
            const savedListsArray = await this.storage.loadSavedLists();
            this.savedLists.clear();
            for (const savedList of savedListsArray) {
                this.savedLists.set(savedList.slug, savedList);
            }
            console.log(`[TodoManager] Loaded ${savedListsArray.length} saved lists from storage`);
        } catch (error) {
            console.error('[TodoManager] Failed to load saved lists from storage:', error);
        }
    }

    private async loadFromStorage(): Promise<void> {
        if (!this.context) {
            return;
        }

        const storageData = this.context.workspaceState.get<{ todos: TodoItem[], title: string }>('agentTodos.todos');

        if (storageData) {
            this.todos = storageData.todos || [];
            this.title = storageData.title || 'Todos';
            this.fireConsolidatedChange();
        }

        // Load saved lists
        await this.loadSavedListsFromStorage();
    }

    public dispose(): void {
        if (this.configurationDisposable) {
            this.configurationDisposable.dispose();
        }
        this.onShouldOpenViewEmitter.dispose();
        this.onDidChangeConfigurationEmitter.dispose();
        this.onDidChangeEmitter.dispose();
        this.onSavedListChangeEmitter.dispose();
    }

    public getNotCompletedCount(): number {
        return this.todos.filter(todo => todo.status !== 'completed').length;
    }

    // Saved list management methods
    public getSavedLists(): SavedTodoList[] {
        return Array.from(this.savedLists.values()).sort((a, b) => 
            b.savedAt.getTime() - a.savedAt.getTime()
        );
    }

    public getSavedListBySlug(slug: string): SavedTodoList | undefined {
        return this.savedLists.get(slug);
    }

    public getSavedListSlugs(): string[] {
        return Array.from(this.savedLists.keys());
    }

    public async clearSavedLists(): Promise<void> {
        this.savedLists.clear();
        await this.saveSavedListsToStorage();
        this.onSavedListChangeEmitter.fire();
        console.log('[TodoManager] Cleared all saved todo lists');
    }

    public async deleteSavedList(slug: string): Promise<boolean> {
        const deleted = this.savedLists.delete(slug);
        if (deleted) {
            await this.saveSavedListsToStorage();
            this.onSavedListChangeEmitter.fire();
            console.log(`[TodoManager] Deleted saved todo list with slug: ${slug}`);
        }
        return deleted;
    }

    private async saveCurrentList(reason: string = 'title change'): Promise<void> {
        // Only save if we have todos and a non-default title
        if (this.todos.length > 0 && this.title !== 'Todos') {
            // Create the potential saved list to check for duplicates
            const potentialSaved: SavedTodoList = {
                id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                title: this.title,
                todos: [...this.todos],
                savedAt: new Date(),
                slug: '' // Will be set after duplicate check
            };

            // Check for exact duplicates in existing saved lists
            const existingLists = Array.from(this.savedLists.values());
            for (const existingList of existingLists) {
                if (areListsExactMatch(potentialSaved, existingList)) {
                    console.log(`[TodoManager] Prevented duplicate save of "${this.title}" (${reason}) - exact match found with existing list "${existingList.slug}" saved at ${existingList.savedAt.toISOString()}`);
                    return; // Silent prevention - do not save duplicate
                }
            }

            // No duplicate found, proceed with saving
            const existingSlugs = new Set(this.savedLists.keys());
            const slug = generateUniqueSlug(this.title, existingSlugs);
            potentialSaved.slug = slug;

            this.savedLists.set(slug, potentialSaved);
            console.log(`[TodoManager] Saved todo list "${this.title}" as "${slug}" (${reason}), ${this.todos.length} todos`);
            
            // Persist saved lists to storage
            await this.saveSavedListsToStorage();

            // Notify saved list change listeners
            this.onSavedListChangeEmitter.fire();
        }
    }

    public async toggleCollapsedMode(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('agentTodos');
            const currentValue = config.get<boolean>('collapsedMode', false);
            await config.update('collapsedMode', !currentValue, vscode.ConfigurationTarget.Workspace);
            
            // Fire consolidated change to refresh tree view
            this.fireConsolidatedChange();
        } catch (error) {
            console.error('[TodoManager] Error toggling collapsed mode:', error);
        }
    }
}
