import * as vscode from 'vscode';
import { TodoItem, Subtask } from './types';
import { CopilotInstructionsManager } from './copilotInstructionsManager';
import { SubtaskManager } from './subtaskManager';
import { TodoValidator } from './todoValidator';

export class TodoManager {
    private static instance: TodoManager;
    private todos: TodoItem[] = [];
    private title: string = 'Todos';
    private readonly onDidChangeTodosEmitter = new vscode.EventEmitter<TodoItem[]>();
    public readonly onDidChangeTodos = this.onDidChangeTodosEmitter.event;
    private readonly onDidChangeTitleEmitter = new vscode.EventEmitter<string>();
    public readonly onDidChangeTitle = this.onDidChangeTitleEmitter.event;
    private readonly onShouldOpenViewEmitter = new vscode.EventEmitter<void>();
    public readonly onShouldOpenView = this.onShouldOpenViewEmitter.event;
    private copilotInstructionsManager: CopilotInstructionsManager;
    private configurationDisposable: vscode.Disposable;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private isUpdatingFile: boolean = false;
    private updateDebounceTimer: NodeJS.Timeout | undefined;
    private context: vscode.ExtensionContext | undefined;

    private constructor() {
        this.copilotInstructionsManager = CopilotInstructionsManager.getInstance();

        // Listen for configuration changes
        this.configurationDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('todoManager.autoInject')) {
                await this.handleAutoInjectSettingChange();
            }
        });

        // Initialize file watching if auto-inject is enabled
        if (this.isAutoInjectEnabled()) {
            this.startWatchingInstructionsFile();
            // Sync from file on startup
            this.syncFromInstructionsFile();
        }
    }

    public static getInstance(): TodoManager {
        if (!TodoManager.instance) {
            TodoManager.instance = new TodoManager();
        }
        return TodoManager.instance;
    }

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        
        // Load todos from storage if auto-inject is disabled
        if (!this.isAutoInjectEnabled()) {
            this.loadFromStorage();
        }
    }

    private isAutoInjectEnabled(): boolean {
        return vscode.workspace.getConfiguration('todoManager').get<boolean>('autoInject', false);
    }

    private isAutoOpenViewEnabled(): boolean {
        return vscode.workspace.getConfiguration('todoManager').get<boolean>('autoOpenView', true);
    }

    private isSubtasksEnabled(): boolean {
        return vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);
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
    }

    private async updateInstructionsIfNeeded(): Promise<void> {
        if (this.isAutoInjectEnabled()) {
            this.isUpdatingFile = true;
            await this.copilotInstructionsManager.updateInstructionsWithTodos(this.todos, this.title);
            // Reset flag after a short delay to handle async file system events
            setTimeout(() => {
                this.isUpdatingFile = false;
            }, 500);
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
                this.onDidChangeTodosEmitter.fire(this.todos);
        // Also fire title change to update progress indicator
        this.onDidChangeTitleEmitter.fire(this.getTitle());
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
        }, 300);
    }

    private async syncFromInstructionsFile(): Promise<void> {
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
                this.onDidChangeTodosEmitter.fire(this.todos);
                // Also fire title change to update progress indicator
                this.onDidChangeTitleEmitter.fire(this.getTitle());
                console.log(`Synced ${todos.length} todos from instructions file`);
            }
        } catch (error) {
            console.error('Error syncing from instructions file:', error);
        }
    }

    private areTodosEqual(todos1: TodoItem[], todos2: TodoItem[]): boolean {
        return TodoValidator.areTodosEqual(todos1, todos2);
    }

    public getTodos(): TodoItem[] {
        return [...this.todos];
    }

    public getTitle(): string {
        const completedCount = this.todos.filter(todo => todo.status === 'completed').length;
        const totalCount = this.todos.length;
        
        if (totalCount === 0) {
            return this.title;
        }
        
        return `${this.title} (${completedCount}/${totalCount})`;
    }

    public async setTodos(todos: TodoItem[], title?: string): Promise<void> {
        const hadTodos = this.todos.length > 0;
        const previousTodoCount = this.todos.length;
        
        this.todos = [...todos];
        if (title !== undefined && title !== this.title) {
            this.title = title;
        }
        this.onDidChangeTodosEmitter.fire(this.todos);
        // Also fire title change to update progress indicator
        this.onDidChangeTitleEmitter.fire(this.getTitle());
        
        // Check if we should open the view
        const hasTodos = this.todos.length > 0;
        const todosChanged = previousTodoCount !== this.todos.length || !this.areTodosEqual(this.todos, todos);
        
        if (this.isAutoOpenViewEnabled() && hasTodos && todosChanged) {
            this.onShouldOpenViewEmitter.fire();
        }
        
        await this.updateInstructionsIfNeeded();
        this.saveToStorage();
    }

    public async clearTodos(): Promise<void> {
        this.todos = [];
        this.title = 'Todos'; // Reset title to default
        this.onDidChangeTodosEmitter.fire(this.todos);
        // Also fire title change to update progress indicator
        this.onDidChangeTitleEmitter.fire(this.getTitle());
        await this.updateInstructionsIfNeeded();
        this.saveToStorage();
    }

    public async deleteTodo(id: string): Promise<void> {
        this.todos = this.todos.filter(t => t.id !== id);
        this.onDidChangeTodosEmitter.fire(this.todos);
        // Also fire title change to update progress indicator
        this.onDidChangeTitleEmitter.fire(this.getTitle());
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
            this.onDidChangeTodosEmitter.fire(this.todos);
            this.onDidChangeTitleEmitter.fire(this.getTitle());
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    public async setTodoPriority(id: string, priority: 'high' | 'medium' | 'low'): Promise<void> {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.priority = priority;
            this.onDidChangeTodosEmitter.fire(this.todos);
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
            this.onDidChangeTodosEmitter.fire(this.todos);
        // Also fire title change to update progress indicator
        this.onDidChangeTitleEmitter.fire(this.getTitle());
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
            this.onDidChangeTodosEmitter.fire(this.todos);
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
            this.onDidChangeTodosEmitter.fire(this.todos);
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
            this.onDidChangeTodosEmitter.fire(this.todos);
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
            this.onDidChangeTodosEmitter.fire(this.todos);
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    // Details management method
    public async setTodoDetails(todoId: string, details: string | undefined): Promise<void> {
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            const sanitizedDetails = TodoValidator.sanitizeDetails(details);
            if (sanitizedDetails === undefined) {
                delete todo.details;
            } else {
                todo.details = sanitizedDetails;
            }
            this.onDidChangeTodosEmitter.fire(this.todos);
            await this.updateInstructionsIfNeeded();
            this.saveToStorage();
        }
    }

    private saveToStorage(): void {
        if (!this.context || this.isAutoInjectEnabled()) {
            return; // Don't save to storage if auto-inject is enabled
        }
        
        const storageData = {
            todos: this.todos,
            title: this.title
        };
        
        this.context.workspaceState.update('todoManager.todos', storageData);
    }

    private loadFromStorage(): void {
        if (!this.context) {
            return;
        }
        
        const storageData = this.context.workspaceState.get<{ todos: TodoItem[], title: string }>('todoManager.todos');
        
        if (storageData) {
            this.todos = storageData.todos || [];
            this.title = storageData.title || 'Todos';
            this.onDidChangeTodosEmitter.fire(this.todos);
            this.onDidChangeTitleEmitter.fire(this.getTitle());
        }
    }

    public dispose(): void {
        this.onDidChangeTodosEmitter.dispose();
        this.onDidChangeTitleEmitter.dispose();
        this.onShouldOpenViewEmitter.dispose();
        this.configurationDisposable.dispose();
        this.stopWatchingInstructionsFile();
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }
    }
}
