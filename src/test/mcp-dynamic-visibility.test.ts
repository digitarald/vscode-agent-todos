import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../mcp/server';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('Dynamic Tool Visibility', () => {
    let server: TodoMCPServer;
    let todoManager: StandaloneTodoManager;
    let originalGetConfig: any;

    setup(async () => {
        // Store original getConfiguration function
        originalGetConfig = vscode.workspace.getConfiguration;
        
        // Mock configuration to disable auto-inject
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'autoInject') {
                            return false;
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };
        
        server = new TodoMCPServer({ port: 0, standalone: false });
        const storage = new InMemoryStorage();
        todoManager = new StandaloneTodoManager(storage);
        server.setTodoManager(todoManager);
        await server.initialize();
    });

    teardown(async () => {
        vscode.workspace.getConfiguration = originalGetConfig;
        if (server) {
            await server.stop();
        }
    });

    test('todo_read tool not available when todo list is empty (non-standalone)', async () => {
        await todoManager.updateTodos([]);
        
        // Test that todo_read returns appropriate response for empty list
        const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError);
        
        const data = JSON.parse(readResult.content[0].text);
        assert.strictEqual(data.todos.length, 0, 'Should return empty todos array');
        
        // todo_write should always work
        const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
            todos: [], title: 'Test'
        });
        assert.ok(!writeResult.isError);
    });

    test('todo_read tool becomes available when todos are added', async () => {
        // Start with empty list
        await todoManager.updateTodos([]);
        
        // Add a todo
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test task',
            status: 'pending',
            priority: 'medium'
        }]);
        
        // Simulate broadcast update
        server.broadcastUpdate({
            type: 'todos-updated',
            todos: todoManager.getTodos(),
            timestamp: Date.now()
        });
        
        // Test that todo_read now returns the todo
        const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError);
        
        const data = JSON.parse(readResult.content[0].text);
        assert.strictEqual(data.todos.length, 1, 'Should return the added todo');
        assert.strictEqual(data.todos[0].content, 'Test task');
    });

    test('todo_read always available in standalone mode', async () => {
        const standaloneServer = new TodoMCPServer({ port: 0, standalone: true });
        const storage = new InMemoryStorage();
        const standaloneManager = new StandaloneTodoManager(storage);
        standaloneServer.setTodoManager(standaloneManager);
        await standaloneServer.initialize();
        
        // Even with empty todos, todo_read should work in standalone mode
        const readResult = await standaloneServer.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError, 'todo_read should work in standalone mode even with empty todos');
        
        const data = JSON.parse(readResult.content[0].text);
        assert.ok(Array.isArray(data.todos), 'Should return todos array');
        
        await standaloneServer.stop();
    });
});