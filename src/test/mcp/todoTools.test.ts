import * as assert from 'assert';
import { TodoTools } from '../../mcp/tools/todoTools';
import { TodoManager } from '../../todoManager';
import { TodoMCPServer } from '../../mcp/server';

suite('MCP Todo Tools Tests', () => {
    let todoTools: TodoTools;
    let todoManager: TodoManager;
    let mockServer: TodoMCPServer;

    setup(() => {
        todoManager = TodoManager.getInstance();
        mockServer = new TodoMCPServer({ standalone: true });
        todoTools = new TodoTools(todoManager, mockServer);
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    suite('Tool Availability', () => {
        test('Should return both tools in standalone mode', async () => {
            const tools = await todoTools.getAvailableTools();

            assert.strictEqual(tools.length, 2);
            assert.ok(tools.some(t => t.name === 'todo_read'));
            assert.ok(tools.some(t => t.name === 'todo_write'));
        });

        test('Should have correct tool schemas', async () => {
            const tools = await todoTools.getAvailableTools();

            const readTool = tools.find(t => t.name === 'todo_read');
            assert.ok(readTool);
            assert.ok(readTool.description.startsWith('Read the current task list'));
            assert.deepStrictEqual(readTool.inputSchema.properties, {});

            const writeTool = tools.find(t => t.name === 'todo_write');
            assert.ok(writeTool);
            assert.ok(writeTool.description.startsWith('Creates and manages a structured task list'));
            assert.ok(writeTool.inputSchema.properties.todos);
            assert.ok(writeTool.inputSchema.properties.title);
        });
    });

    suite('Todo Read Tool', () => {
        test('Should read empty todo list', async () => {
            const result = await todoTools.handleToolCall('todo_read', {});

            assert.strictEqual(result.isError, undefined);
            assert.strictEqual(result.content.length, 1);
            assert.strictEqual(result.content[0].type, 'text');

            const data = JSON.parse(result.content[0].text);
            assert.strictEqual(data.title, 'Todos');
            assert.deepStrictEqual(data.todos, []);
        });

        test('Should read todo list with items', async () => {
            await todoManager.setTodos([
                {
                    id: '1',
                    content: 'Test todo',
                    status: 'pending',
                    priority: 'high'
                }
            ], 'Test List');

            const result = await todoTools.handleToolCall('todo_read', {});

            const data = JSON.parse(result.content[0].text);
            assert.strictEqual(data.title, 'Test List (0/1)');
            assert.strictEqual(data.todos.length, 1);
            assert.strictEqual(data.todos[0].content, 'Test todo');
        });
    });

    suite('Todo Write Tool', () => {
        test('Should write todos successfully', async () => {
            const params = {
                todos: [
                    {
                        id: '1',
                        content: 'New todo',
                        status: 'pending',
                        priority: 'medium'
                    }
                ],
                title: 'New List'
            };

            const result = await todoTools.handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, undefined);
            assert.ok(result.content[0].text.includes('Successfully updated 1 todo items'));
            assert.ok(result.content[0].text.includes('(1 pending, 0 in progress, 0 completed)'));

            // Verify todos were actually saved
            const todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 1);
            assert.strictEqual(todos[0].content, 'New todo');
        });

        test('Should validate todo input', async () => {
            const result = await todoTools.handleToolCall('todo_write', { todos: 'not-an-array' });

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Error: todos must be an array'));
        });

        test('Should enforce single in_progress task rule', async () => {
            const params = {
                todos: [
                    {
                        id: '1',
                        content: 'Task 1',
                        status: 'in_progress',
                        priority: 'high'
                    },
                    {
                        id: '2',
                        content: 'Task 2',
                        status: 'in_progress',
                        priority: 'high'
                    }
                ]
            };

            const result = await todoTools.handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Only ONE task can be in_progress at a time'));
        });

        test('Should handle subtasks when enabled', async () => {
            const params = {
                todos: [
                    {
                        id: '1',
                        content: 'Main task',
                        status: 'pending',
                        priority: 'high',
                        subtasks: [
                            { id: 's1', content: 'Subtask 1', status: 'completed' },
                            { id: 's2', content: 'Subtask 2', status: 'pending' }
                        ]
                    }
                ]
            };

            const result = await todoTools.handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, undefined);
            assert.ok(result.content[0].text.includes('Subtasks: 1/2 completed'));
        });

        test('Should handle todos with adr', async () => {
            const params = {
                todos: [
                    {
                        id: '1',
                        content: 'Task with adr',
                        status: 'pending',
                        priority: 'high',
                        adr: 'Architecture decision record here'
                    }
                ]
            };

            const result = await todoTools.handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, undefined);
            assert.ok(result.content[0].text.includes('ADR added to 1 task(s)'));
        });
    });

    suite('Error Handling', () => {
        test('Should handle unknown tool name', async () => {
            const result = await todoTools.handleToolCall('unknown_tool', {});

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Unknown tool: unknown_tool'));
        });

        test('Should validate todo structure', async () => {
            const params = {
                todos: [
                    {
                        id: '1',
                        // Missing required fields
                        status: 'pending'
                    }
                ]
            };

            const result = await todoTools.handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Error:'));
        });
    });
});