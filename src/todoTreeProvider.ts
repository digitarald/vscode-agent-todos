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
        this.tooltip = 'Use the todo tools in agent mode to create your first task';
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
        const subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);
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
        
        // Add details to tooltip if present
        if (todo.details) {
            tooltipText += `\n\nDetails: ${todo.details}`;
        }
        
        // Add subtask count if present
        if (hasSubtasks) {
            const completedSubtasks = todo.subtasks!.filter(s => s.status === 'completed').length;
            tooltipText += `\n\nSubtasks: ${completedSubtasks}/${todo.subtasks!.length} completed`;
        }
        
        this.tooltip = tooltipText;
        
        // Set resourceUri for FileDecorationProvider
        const hasDetailsFlag = todo.details ? '/details' : '';
        this.resourceUri = vscode.Uri.parse(`todo://${todo.status}/${todo.priority}/${todo.id}${hasDetailsFlag}`);

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
                this.iconPath = new vscode.ThemeIcon('sync', new vscode.ThemeColor('charts.blue'));
                break;
            case 'completed':
                this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
                break;
        }

        // Set contextValue for commands and menus
        const hasDetails = todo.details ? ' has-details' : '';
        this.contextValue = `todoItem todo-${todo.status} todo-${todo.priority}${hasDetails}`;
        
        // Add description to show subtask count and/or details indicator
        const descriptions: string[] = [];
        
        if (hasSubtasks) {
            const { completed, total } = SubtaskManager.countCompletedSubtasks(todo);
            descriptions.push(`${completed}/${total}`);
        }
        
        if (todo.details) {
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
            // Trigger refresh to update decorations
            vscode.commands.executeCommand('todoManager.refreshTodos');
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
            const subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);
            if (subtasksEnabled && element.todo.subtasks && element.todo.subtasks.length > 0) {
                return Promise.resolve(
                    element.todo.subtasks.map(subtask => new SubtaskTreeItem(subtask, element.todo.id))
                );
            }
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
        if (uri.scheme !== 'todo' && uri.scheme !== 'todo-subtask') {
            return undefined;
        }

        const parts = uri.path.split('/').filter(p => p);
        
        if (uri.scheme === 'todo-subtask') {
            // Handle subtask decorations
            const [status] = parts;
            
            if (status === 'completed') {
                return {
                    color: new vscode.ThemeColor('disabledForeground'),
                    propagate: false
                };
            }
            
            return undefined;
        }
        
        // Handle regular todo decorations
        const [status, priority, id] = parts;
        
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
        
        // Note: Details indicator is shown in the tree item description instead of badge
        // to avoid conflicts with priority badges

        return undefined;
    }

    refresh(): void {
        this._onDidChangeFileDecorations.fire(undefined);
    }
}