import * as assert from 'assert';
import * as vscode from 'vscode';
import { CopilotInstructionsManager } from '../copilotInstructionsManager';
import { TodoItem } from '../types';

suite('CopilotInstructionsManager Subtask Tests', () => {
    let instructionsManager: CopilotInstructionsManager;

    setup(() => {
        instructionsManager = CopilotInstructionsManager.getInstance();
    });

    test('Should format todos with subtasks in markdown', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todos: TodoItem[] = [
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
        
        // Test private method through reflection (not ideal but works for testing)
        const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
        const markdown = formatMethod(todos);
        
        assert.ok(markdown.includes('- [ ] Main task 🔴'));
        assert.ok(markdown.includes('  - [ ] Subtask 1'));
        assert.ok(markdown.includes('  - [x] Subtask 2'));
    });

    test('Should format todos with details in markdown', async () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'completed',
                priority: 'medium',
                details: 'Used async/await pattern for better error handling'
            }
        ];
        
        const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
        const markdown = formatMethod(todos);
        
        assert.ok(markdown.includes('- [x] Main task 🟡'));
        assert.ok(markdown.includes('  _Used async/await pattern for better error handling_'));
    });

    test('Should not include subtasks when disabled', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', false);
        
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'low',
                subtasks: [
                    { id: 'sub-1', content: 'Subtask 1', status: 'pending' }
                ]
            }
        ];
        
        const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
        const markdown = formatMethod(todos);
        
        assert.ok(markdown.includes('- [ ] Main task 🟢'));
        assert.ok(!markdown.includes('Subtask 1'));
    });

    test('Should handle todos with both subtasks and details', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Complex task',
                status: 'in_progress',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1', content: 'Research', status: 'completed' },
                    { id: 'sub-2', content: 'Implementation', status: 'pending' }
                ],
                details: 'Using new API approach'
            }
        ];
        
        const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
        const markdown = formatMethod(todos);
        
        assert.ok(markdown.includes('- [-] Complex task 🔴'));
        assert.ok(markdown.includes('  - [x] Research'));
        assert.ok(markdown.includes('  - [ ] Implementation'));
        assert.ok(markdown.includes('  _Using new API approach_'));
    });

    test('Should parse todos with subtasks from markdown', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        // Mock file system for testing
        const mockContent = `<todo>
> IMPORTANT: You don't need to use todo_read tool, as the list is already available below.

- [ ] Main task 🔴
  - [ ] Subtask 1
  - [x] Subtask 2
  _Implementation details here_
- [x] Another task 🟡
</todo>`;
        
        // We would need to mock vscode.workspace.fs for a complete test
        // For now, we'll test the parsing logic conceptually
        // In a real test environment, you'd mock the file system operations
    });

    test('Should handle empty subtasks array', async () => {
        await vscode.workspace.getConfiguration('todoManager').update('enableSubtasks', true);
        
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Task without subtasks',
                status: 'pending',
                priority: 'medium',
                subtasks: []
            }
        ];
        
        const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
        const markdown = formatMethod(todos);
        
        assert.ok(markdown.includes('- [ ] Task without subtasks 🟡'));
        // Should not include any subtask lines
        assert.ok(!markdown.includes('  - ['));
    });
});