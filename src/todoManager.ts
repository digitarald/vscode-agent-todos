import * as vscode from 'vscode';
import { TodoItem } from './types';
import { CopilotInstructionsManager } from './copilotInstructionsManager';
import { TodoValidator } from './todoValidator';
import { PerformanceMonitor } from './utils/performance';
import { TelemetryManager } from './telemetryManager';

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
    private readonly onDidChangeConfigurationEmitter = new vscode.EventEmitter<{ autoInject: boolean; autoInjectFilePath: string }>();
    public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;
    private copilotInstructionsManager: CopilotInstructionsManager;
    private configurationDisposable: vscode.Disposable | undefined;
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

    public initialize(context?: vscode.ExtensionContext): void {
        this.context = context;

        // Load todos from storage
        if (context) {
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
            const config = vscode.workspace.getConfiguration('agentTodos');
            const value = config.get<boolean>('autoOpenView', true);
            console.log(`[TodoManager] isAutoOpenViewEnabled: ${value}`);
            return value;
        } catch (error) {
            console.log(`[TodoManager] isAutoOpenViewEnabled error: ${error}, defaulting to true`);
            return true; // Default to true when vscode is not available
        }
    }

    private getAutoInjectFilePath(): string {
        try {
            return vscode.workspace.getConfiguration('agentTodos').get<string>('autoInjectFilePath', '.github/copilot-instructions.md');
        } catch (error) {
            return '.github/copilot-instructions.md'; // Default when vscode is not available
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

    private loadFromStorage(): void {
        if (!this.context) {
            return;
        }

        const storageData = this.context.workspaceState.get<{ todos: TodoItem[], title: string }>('agentTodos.todos');

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
        this.onShouldOpenViewEmitter.dispose();
        this.onDidChangeConfigurationEmitter.dispose();
        this.onDidChangeEmitter.dispose();
    }

    public getNotCompletedCount(): number {
        return this.todos.filter(todo => todo.status !== 'completed').length;
    }
}
