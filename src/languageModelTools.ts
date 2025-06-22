import * as vscode from 'vscode';
import { TodoManager } from './todoManager';
import { TodoItem, TodoWriteInput } from './types';

export class TodoReadTool implements vscode.LanguageModelTool<{}> {
    private todoManager: TodoManager;

    constructor() {
        this.todoManager = TodoManager.getInstance();
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{}>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        // Check if auto-inject is enabled - if so, this tool should not be available
        const autoInjectEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('autoInject', false);

        if (autoInjectEnabled) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Todo list is automatically available in custom instructions when auto-inject is enabled. This tool is disabled.')
            ]);
        }

        const todos = this.todoManager.getTodos();
        const title = this.todoManager.getTitle();
        const result = {
            title,
            todos
        };

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
        ]);
    }
}

export class TodoWriteTool implements vscode.LanguageModelTool<TodoWriteInput> {
    private todoManager: TodoManager;

    constructor() {
        this.todoManager = TodoManager.getInstance();
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<TodoWriteInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { todos, title } = options.input;

        // Validate input
        if (!Array.isArray(todos)) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: todos must be an array')
            ]);
        }

        // Check for multiple in_progress tasks
        const inProgressTaskCount = todos.filter(t => t.status === 'in_progress').length;
        if (inProgressTaskCount > 1) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('Error: Only ONE task can be in_progress at a time. Found ' + inProgressTaskCount + ' tasks marked as in_progress. Please complete current tasks before starting new ones.')
            ]);
        }

        // Validate each todo item
        for (const todo of todos) {
            if (!todo.id || !todo.content || !todo.status || !todo.priority) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: Each todo must have id, content, status, and priority')
                ]);
            }

            // Validate content has minimum length
            if (todo.content.trim().length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: Task content cannot be empty. Please provide a clear, actionable description.')
                ]);
            }

            if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: status must be one of: pending, in_progress, completed')
                ]);
            }

            if (!['low', 'medium', 'high'].includes(todo.priority)) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: priority must be one of: low, medium, high')
                ]);
            }
        }

        // Update todos
        await this.todoManager.setTodos(todos, title);

        const titleMsg = title ? ` and title to "${title}"` : '';
        const pendingCount = todos.filter(t => t.status === 'pending').length;
        const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
        const completedCount = todos.filter(t => t.status === 'completed').length;
        
        let statusSummary = `(${pendingCount} pending, ${inProgressCount} in progress, ${completedCount} completed)`;
        let reminder = inProgressCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';
        
        // Check if auto-inject is enabled
        const autoInjectEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('autoInject', false);
        const autoInjectNote = autoInjectEnabled ? '\nNote: Todos are automatically synced to <todos> in .github/copilot-instructions.md' : '';
        
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${reminder}${autoInjectNote}`)
        ]);
    }
}
