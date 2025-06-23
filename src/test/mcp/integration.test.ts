import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../../mcp/server';
import { TodoMCPServerProvider } from '../../mcp/mcpProvider';
import { TodoManager } from '../../todoManager';

suite('MCP Integration Tests', () => {
    let server: TodoMCPServer;
    let provider: TodoMCPServerProvider;
    let todoManager: TodoManager;
    let context: vscode.ExtensionContext;

    setup(async function() {
        this.timeout(10000);
        
        // Mock context
        context = {
            subscriptions: []
        } as any;
        
        todoManager = TodoManager.getInstance();
        await todoManager.clearTodos();
        
        // Start MCP provider (which starts the server)
        provider = new TodoMCPServerProvider(context);
        await provider.ensureServerStarted();
        
        // Give everything time to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    teardown(async () => {
        await provider?.dispose();
        await todoManager?.clearTodos();
    });

    test('Should provide todo tools via MCP', async () => {
        const server = provider.getServer();
        assert.ok(server);
        
        // Initialize server first
        await server.initialize();
        
        // Server should expose todo tools
        const tools = await server.getTodoTools().getAvailableTools();
        assert.ok(tools.length > 0);
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));
    });

    test('Should handle todo operations through MCP tools', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Write todos using MCP tool
        const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
            todos: [
                {
                    id: 'integration-1',
                    content: 'Integration test todo',
                    status: 'pending',
                    priority: 'high'
                }
            ],
            title: 'Integration Test'
        });
        
        assert.ok(!writeResult.isError);
        assert.ok(writeResult.content[0].text.includes('Successfully updated'));
        
        // Read todos using MCP tool
        const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
        assert.ok(!readResult.isError);
        
        const data = JSON.parse(readResult.content[0].text);
        assert.strictEqual(data.title, 'Integration Test');
        assert.strictEqual(data.todos.length, 1);
        assert.strictEqual(data.todos[0].content, 'Integration test todo');
    });

    test('Should broadcast updates when todos change', async () => {
        const server = provider.getServer();
        assert.ok(server);
        
        let broadcastCalled = false;
        const originalBroadcast = server.broadcastUpdate.bind(server);
        server.broadcastUpdate = (event) => {
            broadcastCalled = true;
            originalBroadcast(event);
        };
        
        // Change todos
        await todoManager.setTodos([
            {
                id: 'broadcast-test',
                content: 'Test broadcast',
                status: 'pending',
                priority: 'low'
            }
        ]);
        
        // Give it time to process
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Broadcast should have been called
        assert.ok(broadcastCalled);
    });

    test('Should handle configuration changes', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Initially both tools should be available in standalone mode
        const toolsBefore = await server.getTodoTools().getAvailableTools();
        assert.strictEqual(toolsBefore.length, 2);
        
        // In a real scenario, configuration changes would affect tool availability
        // This test verifies the configuration system is in place
        const config = server.getConfig();
        assert.ok(config);
        assert.strictEqual(typeof config.standalone, 'boolean');
    });

    test('Should support workspace root context', () => {
        const server = provider.getServer();
        assert.ok(server);
        
        const testWorkspace = '/test/integration/workspace';
        server.setWorkspaceRoot(testWorkspace);
        
        const config = server.getConfig();
        assert.strictEqual(config.workspaceRoot, testWorkspace);
    });

    test('Should handle multiple concurrent operations', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Perform multiple operations concurrently
        const operations = [
            server.getTodoTools().handleToolCall('todo_read', {}),
            server.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'concurrent-1',
                    content: 'Concurrent test 1',
                    status: 'pending',
                    priority: 'low'
                }]
            }),
            server.getTodoTools().handleToolCall('todo_read', {})
        ];
        
        const results = await Promise.all(operations);
        
        // All operations should succeed
        results.forEach(result => {
            assert.ok(!result.isError);
            assert.ok(result.content.length > 0);
        });
    });
});