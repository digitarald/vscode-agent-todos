import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoWriteTool } from '../languageModelTools';
import { TodoManager } from '../todoManager';
import { TodoItem } from '../types';

suite('Language Model Tools Subtask Tests', () => {
    let todoWriteTool: TodoWriteTool;
    let todoManager: TodoManager;

    setup(() => {
        todoWriteTool = new TodoWriteTool();
        todoManager = TodoManager.getInstance();
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    test('Should accept todos with subtasks when enabled', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todosWithSubtasks: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1', content: 'Subtask 1', status: 'pending' },
                    { id: 'sub-2', content: 'Subtask 2', status: 'completed' }
                ]
            }
        ];
        
        const result = await todoWriteTool.invoke(
            {
                input: { todos: todosWithSubtasks },
                options: {},
                requested: {}
            } as any,
            new vscode.CancellationTokenSource().token
        );
        
        // Access the text from the result parts
        const parts = (result as any).parts || [];
        const resultText = parts[0]?.value || '';
        assert.ok(resultText.includes('Successfully updated'));
        assert.ok(resultText.includes('Subtasks: 1/2 completed'));
        
        const savedTodos = todoManager.getTodos();
        assert.strictEqual(savedTodos[0].subtasks?.length, 2);
    });

    test('Should reject todos with subtasks when disabled', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', false);
        
        const todosWithSubtasks: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1', content: 'Subtask 1', status: 'pending' }
                ]
            }
        ];
        
        const result = await todoWriteTool.invoke(
            {
                input: { todos: todosWithSubtasks },
                options: {},
                requested: {}
            } as any,
            new vscode.CancellationTokenSource().token
        );
        
        const parts = (result as any).parts || [];
        const resultText = parts[0]?.value || '';
        assert.ok(resultText.includes('Error: Subtasks are disabled'));
    });

    test('Should validate subtask structure', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todosWithInvalidSubtasks: any[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1' } // Missing required fields
                ]
            }
        ];
        
        const result = await todoWriteTool.invoke(
            {
                input: { todos: todosWithInvalidSubtasks },
                options: {},
                requested: {}
            } as any,
            new vscode.CancellationTokenSource().token
        );
        
        const parts = (result as any).parts || [];
        const resultText = parts[0]?.value || '';
        assert.ok(resultText.includes('Error: Each subtask must have id, content, and status'));
    });

    test('Should accept todos with details', async () => {
        const todosWithDetails: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'completed',
                priority: 'medium',
                details: 'Used async/await pattern for better error handling'
            }
        ];
        
        const result = await todoWriteTool.invoke(
            {
                input: { todos: todosWithDetails },
                options: {},
                requested: {}
            } as any,
            new vscode.CancellationTokenSource().token
        );
        
        const parts = (result as any).parts || [];
        const resultText = parts[0]?.value || '';
        assert.ok(resultText.includes('Successfully updated'));
        assert.ok(resultText.includes('Details added to 1 task(s)'));
        
        const savedTodos = todoManager.getTodos();
        assert.strictEqual(savedTodos[0].details, 'Used async/await pattern for better error handling');
    });

    test('Should validate subtask status values', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todosWithInvalidSubtaskStatus: any[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1', content: 'Subtask', status: 'in_progress' } // Invalid status
                ]
            }
        ];
        
        const result = await todoWriteTool.invoke(
            {
                input: { todos: todosWithInvalidSubtaskStatus },
                options: {},
                requested: {}
            } as any,
            new vscode.CancellationTokenSource().token
        );
        
        const parts = (result as any).parts || [];
        const resultText = parts[0]?.value || '';
        assert.ok(resultText.includes('Error: subtask status must be one of: pending, completed'));
    });
});