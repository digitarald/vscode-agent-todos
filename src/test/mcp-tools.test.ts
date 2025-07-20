import * as assert from 'assert';
import { TodoMCPServer } from '../mcp/server';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('Todo Tools', () => {
    let todoManager: StandaloneTodoManager;
    let mockServer: TodoMCPServer;

    setup(() => {
        const storage = new InMemoryStorage();
        todoManager = new StandaloneTodoManager(storage);
        mockServer = new TodoMCPServer({ standalone: true });
        mockServer.setTodoManager(todoManager);
    });

    teardown(async () => {
        await todoManager.updateTodos([]);
    });

    test('Should return correct tools for standalone mode', async () => {
        await mockServer.initialize();
        
        // Test that both tools work in standalone mode
        const readResult = await mockServer.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError, 'todo_read should be available in standalone mode');
        
        const writeResult = await mockServer.getTodoTools().handleToolCall('todo_write', {
            todos: [], title: 'Test'
        });
        assert.ok(!writeResult.isError, 'todo_write should be available in standalone mode');
    });

    test('Should have correct tool behavior', async () => {
        await mockServer.initialize();
        
        // Test read tool behavior
        const readResult = await mockServer.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError);
        assert.ok(readResult.content[0].text.includes('Todos'));
        
        // Test write tool behavior  
        const writeResult = await mockServer.getTodoTools().handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'Test List'
        });
        assert.ok(!writeResult.isError);
        assert.ok(writeResult.content[0].text.includes('Successfully updated'));
    });

    test('Should read empty todo list', async () => {
        await mockServer.initialize();
        const result = await mockServer.getTodoTools().handleToolCall('todo_read', {});

        assert.strictEqual(result.isError, undefined);
        assert.strictEqual(result.content.length, 1);
        assert.strictEqual(result.content[0].type, 'text');

        const data = JSON.parse(result.content[0].text);
        assert.strictEqual(data.title, 'Todos');
        assert.deepStrictEqual(data.todos, []);
    });

    test('Should read todo list with items', async () => {
        await mockServer.initialize();
        
        // Write todos via MCP server to set up the test data
        await mockServer.getTodoTools().handleToolCall('todo_write', {
            todos: [{
                id: '1',
                content: 'Test todo',
                status: 'pending',
                priority: 'high'
            }],
            title: 'Test List'
        });

        const result = await mockServer.getTodoTools().handleToolCall('todo_read', {});

        const data = JSON.parse(result.content[0].text);
        assert.strictEqual(data.title, 'Test List');
        assert.strictEqual(data.todos.length, 1);
        assert.strictEqual(data.todos[0].content, 'Test todo');
    });

    test('Should write todos successfully', async () => {
        await mockServer.initialize();
        const params = {
            todos: [{
                id: '1',
                content: 'New todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New List'
        };

        const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

        assert.strictEqual(result.isError, undefined);
        assert.ok(result.content[0].text.includes('Successfully updated 1 todo items'));

        // Verify todos were actually saved
        const todos = todoManager.getTodos();
        assert.strictEqual(todos.length, 1);
        assert.strictEqual(todos[0].content, 'New todo');
    });

    test('Should validate todo input', async () => {
        await mockServer.initialize();
        const result = await mockServer.getTodoTools().handleToolCall('todo_write', { todos: 'not-an-array' });

        assert.strictEqual(result.isError, true);
        assert.ok(result.content[0].text.includes('Error: todos must be an array'));
    });

    test('Should enforce single in_progress task rule', async () => {
        await mockServer.initialize();
        const params = {
            todos: [
                { id: '1', content: 'Task 1', status: 'in_progress', priority: 'high' },
                { id: '2', content: 'Task 2', status: 'in_progress', priority: 'high' }
            ]
        };

        const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

        assert.strictEqual(result.isError, true);
        assert.ok(result.content[0].text.includes('Only ONE task can be in_progress at a time'));
    });

    test('Should handle todos with ADR', async () => {
        await mockServer.initialize();
        const params = {
            todos: [{
                id: '1',
                content: 'Task with adr',
                status: 'pending',
                priority: 'high',
                adr: 'Architecture decision record here'
            }]
        };

        const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

        assert.strictEqual(result.isError, undefined);
        assert.ok(result.content[0].text.includes('ADR added to 1 task(s)'));
    });

    test('Should handle unknown tool name', async () => {
        await mockServer.initialize();
        const result = await mockServer.getTodoTools().handleToolCall('unknown_tool', {});

        assert.strictEqual(result.isError, true);
        assert.ok(result.content[0].text.includes('Unknown tool: unknown_tool'));
    });
});