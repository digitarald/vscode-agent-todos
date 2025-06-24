import * as vscode from 'vscode';
import { TodoItem, Subtask } from './types';
import { CopilotInstructionsManager } from './copilotInstructionsManager';
import { SubtaskManager } from './subtaskManager';
import { TodoValidator } from './todoValidator';
import { PerformanceMonitor } from './utils/performance';

export class TodoManager {
    private static instance: TodoManager;
    private todos: TodoItem[] = [];
    private title: string = 'Todos';
    // Single consolidated change event for better performance
    private readonly onDidChangeEmitter = new vscode.EventEmitter<{ todos: TodoItem[], title: string }>();
    public readonly onDidChange = this.onDidChangeEmitter.event;
    private readonly onShouldOpenViewEmitter = new vscode.EventEmitter<void>();
    public readonly onShouldOpenView = this.onShouldOpenViewEmitter.event;
    // Add configuration change event emitter
    private readonly onDidChangeConfigurationEmitter = new vscode.EventEmitter<{ autoInject: boolean; enableSubtasks: boolean }>();
    public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;
    private copilotInstructionsManager: CopilotInstructionsManager;
    private configurationDisposable: vscode.Disposable | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private isUpdatingFile: boolean = false;
    private updateDebounceTimer: NodeJS.Timeout | undefined;
    private context: vscode.ExtensionContext | undefined;
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
                // Also broadcast changes for other configuration settings that affect MCP tools
                if (event.affectsConfiguration('agentTodos.enableSubtasks')) {
                    this.onDidChangeConfigurationEmitter.fire({
                        autoInject: this.isAutoInjectEnabled(),
                        enableSubtasks: this.isSubtasksEnabled()
                    });
                }
            });

            // Initialize file watching if auto-inject is enabled
            if (this.isAutoInjectEnabled()) {
                this.startWatchingInstructionsFile();
                // Sync from file on startup
                this.syncFromInstructionsFile();
            }
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

    public initialize(context?: vscode.ExtensionContext): void {
        this.context = context;

        // Load todos from storage if auto-inject is disabled
        if (!this.isAutoInjectEnabled() && context) {
            this.loadFromStorage();
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
            return vscode.workspace.getConfiguration('agentTodos').get<boolean>('autoOpenView', true);
        } catch (error) {
            return true; // Default to true when vscode is not available
        }
    }

    private isSubtasksEnabled(): boolean {
        try {
            return vscode.workspace.getConfiguration('agentTodos').get<boolean>('enableSubtasks', true);
        } catch (error) {
            return true; // Default to true when vscode is not available
        }
    }

    private async handleAutoInjectSettingChange(): Promise<void> {
        if (this.isAutoInjectEnabled()) {
            // Auto-inject is now enabled, update the instructions file
            await this.copilotInstructionsManager.updateInstructionsWithTodos(this.todos, this.title);
            this.startWatchingInstructionsFile();
            // Sync from file to get any existing todos
            await this.syncFromInstructionsFile();
        } else {
            // Auto-inject is disabled, remove the todos from instructions
            await this.copilotInstructionsManager.removeInstructionsTodos();
            this.stopWatchingInstructionsFile();
            // Save current todos to storage
            this.saveToStorage();
        }

        // Broadcast configuration change event
        this.onDidChangeConfigurationEmitter.fire({
            autoInject: this.isAutoInjectEnabled(),
            enableSubtasks: this.isSubtasksEnabled()
        });
    }

    private async updateInstructionsIfNeeded(): Promise<void> {
        if (this.isAutoInjectEnabled() && !this.updateInProgress) {
            await PerformanceMonitor.measure('updateInstructionsIfNeeded', async () => {
                this.updateInProgress = true;
                this.isUpdatingFile = true;
                try {
                    await this.copilotInstructionsManager.updateInstructionsWithTodos(this.todos, this.title);
                } finally {
                    // Reset flags after a short delay to handle async file system events
                    setTimeout(() => {
                        this.isUpdatingFile = false;
                        this.updateInProgress = false;
                    }, 500);
                }
            });
        }
    }

    private startWatchingInstructionsFile(): void {
        if (this.fileWatcher) {
            return; // Already watching
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, this.copilotInstructionsManager.getInstructionsFilePath());
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // Watch for changes
        this.fileWatcher.onDidChange((uri) => {
            this.handleInstructionsFileChange();
        });

        this.fileWatcher.onDidCreate((uri) => {
            this.handleInstructionsFileChange();
        });

        this.fileWatcher.onDidDelete((uri) => {
            // If file is deleted while watching, clear todos
            if (!this.isUpdatingFile) {
                this.todos = [];
                this.fireConsolidatedChange();
            }
        });

        console.log('Started watching instructions file for changes');
    }

    private stopWatchingInstructionsFile(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
            console.log('Stopped watching instructions file');
        }
    }

    private handleInstructionsFileChange(): void {
        // Skip if we're the ones updating the file
        if (this.isUpdatingFile) {
            return;
        }

        // Debounce rapid changes
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }

        this.updateDebounceTimer = setTimeout(() => {
            this.syncFromInstructionsFile();
        }, 500); // Increased debounce time to reduce rapid updates
    }

    private async syncFromInstructionsFile(): Promise<void> {
        await PerformanceMonitor.measure('syncFromInstructionsFile', async () => {
            try {
                const parsed = await this.copilotInstructionsManager.parseTodosFromInstructions();
                if (!parsed) {
                    return;
                }

                const { todos, title } = parsed;

                // Check if todos actually changed to avoid unnecessary updates
                const todosChanged = !this.areTodosEqual(this.todos, todos);
                const titleChanged = title !== undefined && title !== this.title;

                if (todosChanged || titleChanged) {
                    this.todos = todos;
                    if (title !== undefined) {
                        this.title = title;
                    }
                    this.fireConsolidatedChange();
                    console.log(`Synced ${todos.length} todos from instructions file`);
                }
            } catch (error) {
                console.error('Error syncing from instructions file:', error);
            }
        });
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
            return this.title;
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
        await PerformanceMonitor.measure('TodoManager.setTodos', async () => {
            const hadTodos = this.todos.length > 0;
            const previousTodoCount = this.todos.length;

            console.log(`[TodoManager] Setting todos: ${todos.length} items${title ? `, title: ${title}` : ''}`);

            this.todos = [...todos];
            if (title !== undefined && title !== this.title) {
                this.title = title;
            }
            this.fireConsolidatedChange();

            // Check if we should open the view
            const hasTodos = this.todos.length > 0;
            const todosChanged = previousTodoCount !== this.todos.length || !this.areTodosEqual(this.todos, todos);

            if (this.isAutoOpenViewEnabled() && hasTodos && todosChanged) {
                this.onShouldOpenViewEmitter.fire();
            }

            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        });
    }

    public async clearTodos(): Promise<void> {
        this.todos = [];
        this.title = 'Todos'; // Reset title to default
        this.fireConsolidatedChange();
        await this.updateInstructionsIfNeeded();
        this.saveToStorage();
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

    // Subtask management methods
    public async addSubtask(todoId: string, subtask: Subtask): Promise<void> {
        if (!this.isSubtasksEnabled()) {
            return;
        }

        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            SubtaskManager.addSubtask(todo, subtask);
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async updateSubtask(todoId: string, subtaskId: string, updates: Partial<Subtask>): Promise<void> {
        if (!this.isSubtasksEnabled()) {
            return;
        }

        const todo = this.todos.find(t => t.id === todoId);
        if (todo && SubtaskManager.updateSubtask(todo, subtaskId, updates)) {
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async deleteSubtask(todoId: string, subtaskId: string): Promise<void> {
        if (!this.isSubtasksEnabled()) {
            return;
        }

        const todo = this.todos.find(t => t.id === todoId);
        if (todo && SubtaskManager.deleteSubtask(todo, subtaskId)) {
            this.fireConsolidatedChange();
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async toggleSubtaskStatus(todoId: string, subtaskId: string): Promise<void> {
        if (!this.isSubtasksEnabled()) {
            return;
        }

        const todo = this.todos.find(t => t.id === todoId);
        if (todo && SubtaskManager.toggleSubtaskStatus(todo, subtaskId)) {
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
        if (this.isAutoInjectEnabled()) {
            return; // Don't save to storage if auto-inject is enabled
        }

        if (!this.context) {
            console.warn('[TodoManager] Cannot save to storage: context not initialized');
            return;
        }

        const storageData = {
            todos: this.todos,
            title: this.title
        };

        try {
            this.context.workspaceState.update('todoManager.todos', storageData);
            console.log('[TodoManager] Saved todos to workspace storage');
        } catch (error) {
            console.error('[TodoManager] Failed to save to storage:', error);
        }
    }

    private loadFromStorage(): void {
        if (!this.context) {
            return;
        }

        const storageData = this.context.workspaceState.get<{ todos: TodoItem[], title: string }>('todoManager.todos');

        if (storageData) {
            this.todos = storageData.todos || [];
            this.title = storageData.title || 'Todos';
            this.fireConsolidatedChange();
        }
    }

    public dispose(): void {
        if (this.configurationDisposable) {
            this.configurationDisposable.dispose();
        }
        this.stopWatchingInstructionsFile();
        this.onShouldOpenViewEmitter.dispose();
        this.onDidChangeConfigurationEmitter.dispose();
        this.onDidChangeEmitter.dispose();
    }

    public getNotCompletedCount(): number {
        return this.todos.filter(todo => todo.status !== 'completed').length;
    }
}
