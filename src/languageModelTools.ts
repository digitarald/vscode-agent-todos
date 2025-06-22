import * as vscode from 'vscode';
import { TodoManager } from './todoManager';
import { TodoItem, TodoWriteInput } from './types';
import { TodoValidator } from './todoValidator';
import { SubtaskManager } from './subtaskManager';

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

        // Check if subtasks are enabled
        const subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);

        // Validate each todo item
        for (const todo of todos) {
            const validation = TodoValidator.validateTodo(todo);
            if (!validation.valid) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`Error: ${validation.error}`)
                ]);
            }

            // Check if subtasks are disabled but todo has subtasks
            if (todo.subtasks && !subtasksEnabled) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Error: Subtasks are disabled in settings. Enable todoManager.enableSubtasks to use subtasks.')
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
        
        // Count subtasks if enabled
        let subtaskInfo = '';
        if (subtasksEnabled) {
            const todosWithSubtasks = todos.filter(t => t.subtasks && t.subtasks.length > 0);
            if (todosWithSubtasks.length > 0) {
                let totalSubtasks = 0;
                let completedSubtasks = 0;
                
                for (const todo of todosWithSubtasks) {
                    const counts = SubtaskManager.countCompletedSubtasks(todo);
                    totalSubtasks += counts.total;
                    completedSubtasks += counts.completed;
                }
                
                subtaskInfo = `\nSubtasks: ${completedSubtasks}/${totalSubtasks} completed across ${todosWithSubtasks.length} tasks`;
            }
        }
        
        // Count todos with details
        const todosWithDetails = todos.filter(t => t.details);
        const detailsInfo = todosWithDetails.length > 0 ? `\nDetails added to ${todosWithDetails.length} task(s)` : '';
        
        let reminder = inProgressCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';
        
        // Check if auto-inject is enabled
        const autoInjectEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('autoInject', false);
        const autoInjectNote = autoInjectEnabled ? '\nNote: Todos are automatically synced to <todos> in .github/copilot-instructions.md' : '';
        
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${subtaskInfo}${detailsInfo}${reminder}${autoInjectNote}`)
        ]);
    }
}
