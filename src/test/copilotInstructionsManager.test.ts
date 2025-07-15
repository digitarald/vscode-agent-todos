import * as assert from 'assert';
import * as vscode from 'vscode';
import { CopilotInstructionsManager } from '../copilotInstructionsManager';
import { TodoItem } from '../types';

suite('Copilot Instructions Integration Tests', () => {
    let instructionsManager: CopilotInstructionsManager;

    setup(() => {
        instructionsManager = CopilotInstructionsManager.getInstance();
    });

    suite('Markdown Formatting', () => {
        test('Should format basic todos in markdown', async () => {
            const todos: TodoItem[] = [
                {
                    id: 'todo-1',
                    content: 'Simple task',
                    status: 'pending',
                    priority: 'high'
                },
                {
                    id: 'todo-2',
                    content: 'Completed task',
                    status: 'completed',
                    priority: 'medium'
                },
                {
                    id: 'todo-3',
                    content: 'In progress task',
                    status: 'in_progress',
                    priority: 'low'
                }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('- [ ] todo-1: Simple task 🔴'));
            assert.ok(markdown.includes('- [x] todo-2: Completed task 🟡'));
            assert.ok(markdown.includes('- [-] todo-3: In progress task 🟢'));
        });

        test('Should format todos with subtasks when enabled', async () => {
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

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

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('- [ ] todo-1: Main task �'));
            assert.ok(markdown.includes('  - [ ] sub-1: Subtask 1'));
            assert.ok(markdown.includes('  - [x] sub-2: Subtask 2'));
        });

        test('Should format todos with ADR in markdown', async () => {
            const todos: TodoItem[] = [
                {
                    id: 'todo-1',
                    content: 'Main task',
                    status: 'completed',
                    priority: 'medium',
                    adr: 'Used async/await pattern for better error handling'
                }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('- [x] todo-1: Main task �'));
            assert.ok(markdown.includes('  _Used async/await pattern for better error handling_'));
        });

        test('Should handle todos with both subtasks and ADR', async () => {
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

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
                    adr: 'Using new API approach'
                }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('- [-] todo-1: Complex task 🔴'));
            assert.ok(markdown.includes('  _Using new API approach_'));
            assert.ok(markdown.includes('  - [x] sub-1: Research'));
            assert.ok(markdown.includes('  - [ ] sub-2: Implementation'));
        });

        test('Should not include subtasks when disabled', async () => {
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', false);

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

            assert.ok(markdown.includes('- [ ] todo-1: Main task 🟢'));
            assert.ok(!markdown.includes('Subtask 1'));
        });

        test('Should handle empty subtasks array', async () => {
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

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

            assert.ok(markdown.includes('- [ ] todo-1: Task without subtasks 🟡'));
            // Should not include any subtask lines
            assert.ok(!markdown.includes('  - ['));
        });

        test('Should preserve IDs and maintain correct order', async () => {
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

            const originalTodos: TodoItem[] = [
                {
                    id: 'custom-todo-123',
                    content: 'Task with custom ID',
                    status: 'in_progress',
                    priority: 'high',
                    adr: 'Important architecture decision',
                    subtasks: [
                        { id: 'custom-sub-456', content: 'First step', status: 'completed' },
                        { id: 'custom-sub-789', content: 'Second step', status: 'pending' }
                    ]
                },
                {
                    id: 'another-id-999',
                    content: 'Simple task',
                    status: 'pending',
                    priority: 'low'
                }
            ];

            // Format to markdown
            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(originalTodos);

            // Verify formatted output contains IDs
            assert.ok(markdown.includes('custom-todo-123:'));
            assert.ok(markdown.includes('custom-sub-456:'));
            assert.ok(markdown.includes('custom-sub-789:'));
            assert.ok(markdown.includes('another-id-999:'));

            // Verify order: adr before subtasks
            const lines = markdown.split('\n');
            const taskIndex = lines.findIndex((l: string) => l.includes('Task with custom ID'));
            const adrIndex = lines.findIndex((l: string) => l.includes('Important architecture decision'));
            const subtask1Index = lines.findIndex((l: string) => l.includes('First step'));

            assert.ok(taskIndex < adrIndex, 'Task should come before adr');
            assert.ok(adrIndex < subtask1Index, 'ADR should come before subtasks');
        });
    });

    suite('Priority Icons', () => {
        test('Should use correct priority icons', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'High priority', status: 'pending', priority: 'high' },
                { id: '2', content: 'Medium priority', status: 'pending', priority: 'medium' },
                { id: '3', content: 'Low priority', status: 'pending', priority: 'low' }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('High priority 🔴'));
            assert.ok(markdown.includes('Medium priority 🟡'));
            assert.ok(markdown.includes('Low priority 🟢'));
        });

        test('Should use correct status markers', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Pending task', status: 'pending', priority: 'medium' },
                { id: '2', content: 'In progress task', status: 'in_progress', priority: 'medium' },
                { id: '3', content: 'Completed task', status: 'completed', priority: 'medium' }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);
            const markdown = formatMethod(todos);

            assert.ok(markdown.includes('- [ ] 1: Pending task'));
            assert.ok(markdown.includes('- [-] 2: In progress task'));
            assert.ok(markdown.includes('- [x] 3: Completed task'));
        });
    });

    suite('Configuration Integration', () => {
        test('Should respect enableSubtasks configuration', async () => {
            const todos: TodoItem[] = [
                {
                    id: 'test-1',
                    content: 'Test task',
                    status: 'pending',
                    priority: 'medium',
                    subtasks: [
                        { id: 'sub-1', content: 'Test subtask', status: 'pending' }
                    ]
                }
            ];

            const formatMethod = (instructionsManager as any).formatTodosAsMarkdown.bind(instructionsManager);

            // With subtasks enabled
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);
            let markdown = formatMethod(todos);
            assert.ok(markdown.includes('Test subtask'));

            // With subtasks disabled
            await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', false);
            markdown = formatMethod(todos);
            assert.ok(!markdown.includes('Test subtask'));
        });
    });

    suite('Integration with Auto-Inject', () => {
        test('Should be designed for one-way export only', () => {
            // This test verifies the architectural pattern
            // CopilotInstructionsManager only writes, never reads todos from markdown
            assert.ok(instructionsManager, 'Manager should exist');

            // The manager should have formatting methods but no parsing methods
            assert.ok(typeof (instructionsManager as any).formatTodosAsMarkdown === 'function');

            // Should not have methods for reading/parsing todos from markdown
            // (This is by design - todos are stored in WorkspaceState, not markdown)
            assert.strictEqual(typeof (instructionsManager as any).parseTodosFromMarkdown, 'undefined');
        });
    });
});