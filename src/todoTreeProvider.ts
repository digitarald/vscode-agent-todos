import * as vscode from 'vscode';
import { TodoItem } from './types';
import { TodoManager } from './todoManager';

// Section tree item for grouping todos in collapsed mode
export class TodoSectionItem extends vscode.TreeItem {
    constructor(
        public readonly sectionType: 'completed' | 'pending',
        public readonly todos: TodoItem[],
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        const count = todos.length;
        const label = sectionType === 'completed' 
            ? `Completed (${count})` 
            : `Pending (${count})`;
        
        super(label, collapsibleState);
        
        this.contextValue = `todoSection section-${sectionType}`;
        this.tooltip = `${count} ${sectionType} todo${count === 1 ? '' : 's'}`;
        
        // Set different icons for sections
        if (sectionType === 'completed') {
            this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-large', new vscode.ThemeColor('foreground'));
        }
        
        // Add visual distinction
        this.description = sectionType === 'completed' ? '✓' : '○';
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

        super(displayContent, collapsibleState || vscode.TreeItemCollapsibleState.None);

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
            tooltipText += `\n\n${todo.adr}`;
        }

        this.tooltip = tooltipText;

        // Set resourceUri for FileDecorationProvider
        const hasAdrFlag = todo.adr ? '/adr' : '';
        this.resourceUri = vscode.Uri.parse(`todo://${todo.status}/${todo.priority}/${todo.id}${hasAdrFlag}`);

        // Set different icons and colors based on status and priority
        switch (todo.status) {
            case 'pending':
                if (todo.priority === 'high') {
                    this.iconPath = new vscode.ThemeIcon('circle-large', new vscode.ThemeColor('list.warningForeground'));
                } else if (todo.priority === 'medium') {
                    this.iconPath = new vscode.ThemeIcon('circle');
                } else {
                    this.iconPath = new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('descriptionForeground'));
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

        // Add description to show details indicator
        if (todo.adr) {
            this.description = todo.adr;
        }

        // No click command - use inline action instead
    }

    static markAsRecentlyChanged(todoId: string): void {
        this.recentlyChangedItems.add(todoId);
        // Remove the highlight after 3 seconds
        setTimeout(() => {
            this.recentlyChangedItems.delete(todoId);
            // Only refresh decorations, not the entire tree
            vscode.commands.executeCommand('agentTodos.refreshDecorations');
        }, 3000);
    }

    static isRecentlyChanged(todoId: string): boolean {
        return this.recentlyChangedItems.has(todoId);
    }
}

// Union type for tree items
export type TodoTreeNode = TodoTreeItem | TodoSectionItem;

export class TodoTreeDataProvider implements vscode.TreeDataProvider<TodoTreeNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TodoTreeNode | undefined | null | void>();
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

    getTreeItem(element: TodoTreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TodoTreeNode): Thenable<TodoTreeNode[]> {
        if (!element) {
            // Root level - check if collapsed mode is enabled
            const todos = this.todoManager.getTodos();
            const isCollapsedMode = this.todoManager.isCollapsedModeEnabled();
            
            if (!isCollapsedMode) {
                // Normal mode - return all todos as flat list
                return Promise.resolve(
                    todos.map(todo => new TodoTreeItem(todo))
                );
            }
            
            // Collapsed mode - group todos by status
            const completedTodos = todos.filter(t => t.status === 'completed');
            const pendingTodos = todos.filter(t => t.status === 'pending');
            const inProgressTodos = todos.filter(t => t.status === 'in_progress');
            
            const result: TodoTreeNode[] = [];
            
            // Show in-progress todos individually at the top
            inProgressTodos.forEach(todo => {
                result.push(new TodoTreeItem(todo));
            });
            
            // Handle pending todos
            if (pendingTodos.length > 0) {
                if (inProgressTodos.length === 0 && pendingTodos.length > 0) {
                    // No in-progress tasks: show first pending individually, then group the rest
                    result.push(new TodoTreeItem(pendingTodos[0]));
                    if (pendingTodos.length > 1) {
                        const remainingPending = pendingTodos.slice(1);
                        result.push(new TodoSectionItem('pending', remainingPending, vscode.TreeItemCollapsibleState.Collapsed));
                    }
                } else {
                // Has in-progress tasks: group all pending todos
                    result.push(new TodoSectionItem('pending', pendingTodos, vscode.TreeItemCollapsibleState.Collapsed));
                }
            }
            
            // Always group completed todos if there are any
            if (completedTodos.length > 0) {
                result.push(new TodoSectionItem('completed', completedTodos, vscode.TreeItemCollapsibleState.Collapsed));
            }
            
            return Promise.resolve(result);
        } else if (element instanceof TodoSectionItem) {
            // Return todos for the section
            return Promise.resolve(
                element.todos.map(todo => new TodoTreeItem(todo))
            );
        }
        
        // TodoTreeItem has no children
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
                if (commands.includes('agentTodos.refreshDecorations')) {
                    vscode.commands.executeCommand('agentTodos.refreshDecorations');
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