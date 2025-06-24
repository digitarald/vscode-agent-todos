import * as vscode from 'vscode';
import { TodoItem, Subtask } from './types';
import { TodoManager } from './todoManager';
import { SubtaskManager } from './subtaskManager';

export class EmptyStateTreeItem extends vscode.TreeItem {
    constructor() {
        super('No todos yet', vscode.TreeItemCollapsibleState.None);
        this.description = 'Get started by adding your first task';
        this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('descriptionForeground'));
        this.contextValue = 'emptyState';
        this.tooltip = 'Click to start planning with AI';
        this.command = {
            command: 'todoManager.startPlanning',
            title: 'Start Planning'
        };
    }
}

export class TodoTreeItem extends vscode.TreeItem {
    private static recentlyChangedItems = new Set<string>();

    constructor(
        public readonly todo: TodoItem,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        // Clean up content for display - replace newlines with spaces
        const displayContent = todo.content.replace(/\s+/g, ' ').trim();

        // Check if subtasks are enabled and todo has subtasks
        const subtasksEnabled = vscode.workspace.getConfiguration('agentTodos').get<boolean>('enableSubtasks', true);
        const hasSubtasks = subtasksEnabled && todo.subtasks && todo.subtasks.length > 0;
        const finalCollapsibleState = collapsibleState !== undefined ? collapsibleState :
            (hasSubtasks ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        super(displayContent, finalCollapsibleState);

        // Enhanced tooltip with status and priority
        const statusLabel = todo.status === 'pending' ? 'Pending' :
            todo.status === 'in_progress' ? 'In Progress' :
                'Completed';
        const priorityEmoji = todo.priority === 'high' ? '🔴' :
            todo.priority === 'medium' ? '🟡' :
                '🟢';

        let tooltipText = `${statusLabel}: ${todo.content}\n${priorityEmoji} ${todo.priority.charAt(0).toUpperCase() + todo.priority.slice(1)} priority`;

        // Add adr to tooltip if present
        if (todo.adr) {
            tooltipText += `\n\nADR: ${todo.adr}`;
        }

        // Add subtask count if present
        if (hasSubtasks) {
            const completedSubtasks = todo.subtasks!.filter(s => s.status === 'completed').length;
            tooltipText += `\n\nSubtasks: ${completedSubtasks}/${todo.subtasks!.length} completed`;
        }

        this.tooltip = tooltipText;

        // Set resourceUri for FileDecorationProvider
        const hasAdrFlag = todo.adr ? '/adr' : '';
        this.resourceUri = vscode.Uri.parse(`todo://${todo.status}/${todo.priority}/${todo.id}${hasAdrFlag}`);

        // Set different icons and colors based on status and priority
        switch (todo.status) {
            case 'pending':
                if (todo.priority === 'high') {
                    this.iconPath = new vscode.ThemeIcon('arrow-circle-up', new vscode.ThemeColor('list.warningForeground'));
                } else if (todo.priority === 'medium') {
                    this.iconPath = new vscode.ThemeIcon('arrow-circle-right');
                } else {
                    this.iconPath = new vscode.ThemeIcon('arrow-circle-down', new vscode.ThemeColor('descriptionForeground'));
                }
                break;
            case 'in_progress':
                this.iconPath = new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.blue'));
                break;
            case 'completed':
                this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
                break;
        }

        // Set contextValue for commands and menus
        const hasAdr = todo.adr ? ' has-adr' : '';
        this.contextValue = `todoItem todo-${todo.status} todo-${todo.priority}${hasAdr}`;

        // Add description to show subtask count and/or details indicator
        const descriptions: string[] = [];

        if (hasSubtasks) {
            const { completed, total } = SubtaskManager.countCompletedSubtasks(todo);
            descriptions.push(`${completed}/${total}`);
        }

        if (todo.adr) {
            descriptions.push('•');
        }

        if (descriptions.length > 0) {
            this.description = descriptions.join(' ');
        }

        // No click command - use inline action instead
    }

    static markAsRecentlyChanged(todoId: string): void {
        this.recentlyChangedItems.add(todoId);
        // Remove the highlight after 3 seconds
        setTimeout(() => {
            this.recentlyChangedItems.delete(todoId);
            // Only refresh decorations, not the entire tree
            vscode.commands.executeCommand('todoManager.refreshDecorations');
        }, 3000);
    }

    static isRecentlyChanged(todoId: string): boolean {
        return this.recentlyChangedItems.has(todoId);
    }
}

export class SubtaskTreeItem extends vscode.TreeItem {
    constructor(
        public readonly subtask: Subtask,
        public readonly parentTodoId: string
    ) {
        const displayContent = subtask.content.replace(/\s+/g, ' ').trim();
        super(displayContent, vscode.TreeItemCollapsibleState.None);

        // Set tooltip
        const statusLabel = subtask.status === 'pending' ? 'Pending' : 'Completed';
        this.tooltip = `${statusLabel}: ${subtask.content}`;

        // Set resourceUri for FileDecorationProvider
        this.resourceUri = vscode.Uri.parse(`todo-subtask://${subtask.status}/${parentTodoId}/${subtask.id}`);

        // Set icon based on status
        if (subtask.status === 'pending') {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        } else {
            this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
        }

        // Set contextValue for commands
        this.contextValue = `subtaskItem subtask-${subtask.status}`;
    }
}

export class TodoTreeDataProvider implements vscode.TreeDataProvider<TodoTreeItem | SubtaskTreeItem | EmptyStateTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | SubtaskTreeItem | EmptyStateTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private todoManager: TodoManager;
    private previousTodos: TodoItem[] = [];
    private isRefreshing: boolean = false;
    private refreshDebounceTimer: NodeJS.Timeout | undefined;
    private pendingRefresh: boolean = false;

    constructor() {
        this.todoManager = TodoManager.getInstance();
        // Use consolidated change event
        this.todoManager.onDidChange(() => {
            this.debouncedRefresh();
        });
    }

    private detectChangedItems(): void {
        const currentTodos = this.todoManager.getTodos();

        // Find items that have changed status
        for (const currentTodo of currentTodos) {
            const previousTodo = this.previousTodos.find(t => t.id === currentTodo.id);
            if (previousTodo && previousTodo.status !== currentTodo.status) {
                TodoTreeItem.markAsRecentlyChanged(currentTodo.id);
            }
        }

        // Find newly added items
        for (const currentTodo of currentTodos) {
            if (!this.previousTodos.find(t => t.id === currentTodo.id)) {
                TodoTreeItem.markAsRecentlyChanged(currentTodo.id);
            }
        }

        this.previousTodos = [...currentTodos];
    }

    getTreeItem(element: TodoTreeItem | SubtaskTreeItem | EmptyStateTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TodoTreeItem | SubtaskTreeItem | EmptyStateTreeItem): Thenable<(TodoTreeItem | SubtaskTreeItem | EmptyStateTreeItem)[]> {
        if (!element) {
            // Root level - return all todos or empty state
            const todos = this.todoManager.getTodos();

            if (todos.length === 0) {
                // Show empty state
                return Promise.resolve([new EmptyStateTreeItem()]);
            }

            return Promise.resolve(
                todos.map(todo => new TodoTreeItem(todo))
            );
        } else if (element instanceof TodoTreeItem) {
            // Return subtasks if enabled and present
            const subtasksEnabled = vscode.workspace.getConfiguration('agentTodos').get<boolean>('enableSubtasks', true);
            if (subtasksEnabled && element.todo.subtasks && element.todo.subtasks.length > 0) {
                return Promise.resolve(
                    element.todo.subtasks.map(subtask => new SubtaskTreeItem(subtask, element.todo.id))
                );
            }
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        console.log('[TodoTreeProvider] Manual refresh triggered');
        this.debouncedRefresh();
    }

    private debouncedRefresh(): void {
        // Clear any pending refresh
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }

        this.pendingRefresh = true;

        // Check for empty state transitions for immediate refresh
        const currentTodos = this.todoManager.getTodos();
        const isEmptyTransition = (this.previousTodos.length > 0 && currentTodos.length === 0) ||
                                 (this.previousTodos.length === 0 && currentTodos.length > 0);

        if (isEmptyTransition) {
            console.log('[TodoTreeProvider] Empty transition detected, immediate refresh');
            this.executeRefresh();
            return;
        }

        // Debounce rapid refreshes with minimal delay
        this.refreshDebounceTimer = setTimeout(() => {
            if (!this.pendingRefresh) { return; }
            this.executeRefresh();
        }, 50); // Further reduced for better responsiveness
    }

    private executeRefresh(): void {
        console.log('[TodoTreeProvider] Executing refresh');
        this.isRefreshing = true;

        // Detect changed items for highlighting
        this.detectChangedItems();

        // Fire with undefined to force complete refresh of the tree
        this._onDidChangeTreeData.fire(undefined);

        // Reset refreshing flag and trigger decoration refresh after a short delay
        setTimeout(() => {
            this.isRefreshing = false;
            this.pendingRefresh = false;
            // Only execute command if it exists (might not in test environment)
            vscode.commands.getCommands().then(commands => {
                if (commands.includes('todoManager.refreshDecorations')) {
                    vscode.commands.executeCommand('todoManager.refreshDecorations');
                }
            });
        }, 50); // Reduced delay
    }
}

export class TodoDecorationProvider implements vscode.FileDecorationProvider {
    private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
    private decorationCache = new Map<string, vscode.FileDecoration | undefined>();
    private refreshDebounceTimer: NodeJS.Timeout | undefined;

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'todo' && uri.scheme !== 'todo-subtask') {
            return undefined;
        }

        // Check cache first
        const cacheKey = uri.toString();
        if (this.decorationCache.has(cacheKey)) {
            return this.decorationCache.get(cacheKey);
        }

        const parts = uri.path.split('/').filter(p => p);

        if (uri.scheme === 'todo-subtask') {
            // Handle subtask decorations
            const [status] = parts;

            let decoration: vscode.FileDecoration | undefined;

            if (status === 'completed') {
                decoration = {
                    color: new vscode.ThemeColor('disabledForeground'),
                    propagate: false
                };
            }

            // Cache and return
            this.decorationCache.set(cacheKey, decoration);
            return decoration;
        }

        // Handle regular todo decorations
        const [status, priority, id] = parts;

        // Check if this item was recently changed
        if (id && TodoTreeItem.isRecentlyChanged(id)) {
            const decoration = {
                badge: '●',
                color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
                tooltip: 'Recently changed'
            };
            this.decorationCache.set(cacheKey, decoration);
            return decoration;
        }

        // Status-based decorations
        let decoration: vscode.FileDecoration | undefined;

        switch (status) {
            case 'in_progress':
                decoration = {
                    badge: '▸',
                    color: new vscode.ThemeColor('charts.blue'),
                    tooltip: 'In Progress'
                };
                this.decorationCache.set(cacheKey, decoration);
                return decoration;
            case 'completed':
                decoration = {
                    color: new vscode.ThemeColor('disabledForeground'),
                    propagate: false
                };
                this.decorationCache.set(cacheKey, decoration);
                return decoration;
        }

        // Priority badges for pending items
        if (status === 'pending' && priority === 'high') {
            decoration = {
                badge: '!',
                color: new vscode.ThemeColor('list.warningForeground'),
                tooltip: 'High Priority'
            };
            this.decorationCache.set(cacheKey, decoration);
            return decoration;
        }

        // Note: Details indicator is shown in the tree item description instead of badge
        // to avoid conflicts with priority badges

        decoration = undefined;

        // Cache the result
        this.decorationCache.set(cacheKey, decoration);

        return decoration;
    }

    refresh(): void {
        // Clear cache
        this.decorationCache.clear();

        // Debounce rapid refreshes
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }

        this.refreshDebounceTimer = setTimeout(() => {
            this._onDidChangeFileDecorations.fire(undefined);
        }, 50);
    }

}