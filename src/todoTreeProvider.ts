import * as vscode from 'vscode';
import { TodoItem } from './types';
import { TodoManager } from './todoManager';

export class EmptyStateTreeItem extends vscode.TreeItem {
    constructor() {
        super('No todos yet', vscode.TreeItemCollapsibleState.None);
        this.description = 'Get started by adding your first task';
        this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('descriptionForeground'));
        this.contextValue = 'emptyState';
        this.tooltip = 'Use the todo tools in agent mode to create your first task';
    }
}

export class TodoTreeItem extends vscode.TreeItem {
    private static recentlyChangedItems = new Set<string>();
    
    constructor(
        public readonly todo: TodoItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        // Clean up content for display - replace newlines with spaces
        const displayContent = todo.content.replace(/\s+/g, ' ').trim();
        super(displayContent, collapsibleState);

        // Enhanced tooltip with status and priority
        const statusLabel = todo.status === 'pending' ? 'Pending' : 
                           todo.status === 'in_progress' ? 'In Progress' : 
                           'Completed';
        const priorityEmoji = todo.priority === 'high' ? '🔴' :
                             todo.priority === 'medium' ? '🟡' :
                             '🟢';
        
        this.tooltip = `${statusLabel}: ${todo.content}\n${priorityEmoji} ${todo.priority.charAt(0).toUpperCase() + todo.priority.slice(1)} priority`;
        
        // Set resourceUri for FileDecorationProvider
        this.resourceUri = vscode.Uri.parse(`todo://${todo.status}/${todo.priority}/${todo.id}`);

        // Set different icons and colors based on status and priority
        switch (todo.status) {
            case 'pending':
                if (todo.priority === 'high') {
                    this.iconPath = new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('list.warningForeground'));
                } else if (todo.priority === 'medium') {
                    this.iconPath = new vscode.ThemeIcon('circle-outline');
                } else {
                    this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
                }
                break;
            case 'in_progress':
                this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
                break;
            case 'completed':
                this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
                break;
        }

        // Set contextValue for commands and menus
        this.contextValue = `todoItem todo-${todo.status} todo-${todo.priority}`;

        // Remove click command - items are not clickable anymore
    }
    
    static markAsRecentlyChanged(todoId: string): void {
        this.recentlyChangedItems.add(todoId);
        // Remove the highlight after 3 seconds
        setTimeout(() => {
            this.recentlyChangedItems.delete(todoId);
            // Trigger refresh to update decorations
            vscode.commands.executeCommand('todoManager.refreshTodos');
        }, 3000);
    }
    
    static isRecentlyChanged(todoId: string): boolean {
        return this.recentlyChangedItems.has(todoId);
    }
}

export class TodoTreeDataProvider implements vscode.TreeDataProvider<TodoTreeItem | EmptyStateTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeItem | EmptyStateTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private todoManager: TodoManager;
    private previousTodos: TodoItem[] = [];

    constructor() {
        this.todoManager = TodoManager.getInstance();
        this.todoManager.onDidChangeTodos(() => {
            this.detectChangedItems();
            this._onDidChangeTreeData.fire();
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

    getTreeItem(element: TodoTreeItem | EmptyStateTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TodoTreeItem | EmptyStateTreeItem): Thenable<(TodoTreeItem | EmptyStateTreeItem)[]> {
        if (!element) {
            // Root level - return all todos or empty state
            const todos = this.todoManager.getTodos();
            
            if (todos.length === 0) {
                // Show empty state
                return Promise.resolve([new EmptyStateTreeItem()]);
            }
            
            return Promise.resolve(
                todos.map(todo => new TodoTreeItem(todo, vscode.TreeItemCollapsibleState.None))
            );
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export class TodoDecorationProvider implements vscode.FileDecorationProvider {
    private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'todo') {
            return undefined;
        }

        const [status, priority, id] = uri.path.split('/').filter(p => p);
        
        // Check if this item was recently changed
        if (id && TodoTreeItem.isRecentlyChanged(id)) {
            return {
                badge: '●',
                color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
                tooltip: 'Recently changed'
            };
        }

        // Status-based decorations
        switch (status) {
            case 'in_progress':
                return {
                    badge: '▸',
                    color: new vscode.ThemeColor('charts.blue'),
                    tooltip: 'In Progress'
                };
            case 'completed':
                return {
                    color: new vscode.ThemeColor('disabledForeground'),
                    propagate: false
                };
        }

        // Priority badges for pending items
        if (status === 'pending' && priority === 'high') {
            return {
                badge: '!',
                color: new vscode.ThemeColor('list.warningForeground'),
                tooltip: 'High Priority'
            };
        }

        return undefined;
    }

    refresh(): void {
        this._onDidChangeFileDecorations.fire(undefined);
    }
}