import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../../mcp/server';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { StandaloneTodoManager } from '../../mcp/standaloneTodoManager';

suite('MCP Dynamic Todo Read Tool', () => {
    let server: TodoMCPServer;
    let todoManager: StandaloneTodoManager;
    let originalGetConfig: any;

    setup(async () => {
        // Store original getConfiguration function
        originalGetConfig = vscode.workspace.getConfiguration;
        
        // Mock the getConfiguration to disable auto-inject (so todo_read can appear)
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'autoInject') {
                            return false; // Disable auto-inject so todo_read can appear
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };
        
        // Create server with test configuration
        server = new TodoMCPServer({
            port: 0,
            standalone: false
        });

        // Create a standalone manager with in-memory storage
        const storage = new InMemoryStorage();
        todoManager = new StandaloneTodoManager(storage);
        
        // Set the manager on the server
        server.setTodoManager(todoManager);
        
        // Initialize the server (this creates TodoTools)
        await server.initialize();
    });

    teardown(async () => {
        // Restore original getConfiguration
        vscode.workspace.getConfiguration = originalGetConfig;
        
        if (server) {
            await server.stop();
        }
    });

    test('todo_read tool not available when todo list is empty', async () => {
        // Ensure todo list is empty
        await todoManager.updateTodos([]);
        
        const todoTools = server.getTodoTools();
        const tools = await todoTools.getAvailableTools();
        
        const readTool = tools.find(t => t.name === 'todo_read');
        assert.ok(!readTool, 'todo_read tool should not be available when todo list is empty');
        
        // todo_write should still be available
        const writeTool = tools.find(t => t.name === 'todo_write');
        assert.ok(writeTool, 'todo_write tool should always be available');
    });

    test('todo_read tool becomes available when todos are added', async () => {
        // Start with empty list
        await todoManager.updateTodos([]);
        
        let todoTools = server.getTodoTools();
        let tools = await todoTools.getAvailableTools();
        assert.ok(!tools.find(t => t.name === 'todo_read'), 'todo_read should not be available initially');
        
        // Add a todo
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test task',
            status: 'pending',
            priority: 'medium'
        }]);
        
        // Simulate the todos-updated broadcast
        server.broadcastUpdate({
            type: 'todos-updated',
            todos: todoManager.getTodos(),
            timestamp: Date.now()
        });
        
        // Get tools again - should now include todo_read
        todoTools = server.getTodoTools();
        tools = await todoTools.getAvailableTools();
        
        const readTool = tools.find(t => t.name === 'todo_read');
        assert.ok(readTool, 'todo_read tool should be available after adding todos');
    });

    test('todo_read tool disappears when all todos are removed', async () => {
        // Start with a todo
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test task',
            status: 'pending',
            priority: 'medium'
        }]);
        
        let todoTools = server.getTodoTools();
        let tools = await todoTools.getAvailableTools();
        assert.ok(tools.find(t => t.name === 'todo_read'), 'todo_read should be available with todos');
        
        // Clear todos
        await todoManager.updateTodos([]);
        
        // Simulate the todos-updated broadcast
        server.broadcastUpdate({
            type: 'todos-updated',
            todos: [],
            timestamp: Date.now()
        });
        
        // Get tools again - todo_read should be gone
        todoTools = server.getTodoTools();
        tools = await todoTools.getAvailableTools();
        
        const readTool = tools.find(t => t.name === 'todo_read');
        assert.ok(!readTool, 'todo_read tool should disappear when all todos are removed');
    });

    test('todo_read always available in standalone mode regardless of todo count', async () => {
        // Create a standalone server
        const standaloneServer = new TodoMCPServer({
            port: 0,
            standalone: true
        });
        
        const storage = new InMemoryStorage();
        const standaloneManager = new StandaloneTodoManager(storage);
        standaloneServer.setTodoManager(standaloneManager);
        await standaloneServer.initialize();
        
        // Even with empty todos, todo_read should be available in standalone mode
        const todoTools = standaloneServer.getTodoTools();
        const tools = await todoTools.getAvailableTools();
        
        const readTool = tools.find(t => t.name === 'todo_read');
        assert.ok(readTool, 'todo_read tool should always be available in standalone mode');
        
        await standaloneServer.stop();
    });

    test('todo_read always hidden when auto-inject is enabled regardless of todo count', async () => {
        // Mock auto-inject as enabled
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'autoInject') {
                            return true; // Enable auto-inject
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };
        
        // Add todos
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test task',
            status: 'pending',
            priority: 'medium'
        }]);
        
        // Broadcast configuration change to update tools
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                autoInject: true,
                enableSubtasks: true
            },
            timestamp: Date.now()
        });
        
        const todoTools = server.getTodoTools();
        const tools = await todoTools.getAvailableTools();
        
        const readTool = tools.find(t => t.name === 'todo_read');
        assert.ok(!readTool, 'todo_read tool should be hidden when auto-inject is enabled, even with todos');
    });
});