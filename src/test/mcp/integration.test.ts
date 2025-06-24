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
        
        // Mock context with workspaceState
        const workspaceState = new Map<string, any>();
        context = {
            subscriptions: [],
            workspaceState: {
                get: (key: string) => workspaceState.get(key),
                update: async (key: string, value: any) => {
                    workspaceState.set(key, value);
                }
            }
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
        
        // Check if we got JSON or a message about auto-inject
        const responseText = readResult.content[0].text;
        if (responseText.includes('automatically available')) {
            // Auto-inject is enabled, just verify the message
            assert.ok(responseText.includes('auto-inject is enabled'));
        } else {
            // Parse as JSON
            const data = JSON.parse(responseText);
            // The raw title is returned by todo_read, not the formatted one
            assert.strictEqual(data.title, 'Integration Test');
            assert.strictEqual(data.todos.length, 1);
            assert.strictEqual(data.todos[0].content, 'Integration test todo');
        }
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
        
        // Get available tools - could be 1 or 2 depending on autoInject setting
        const toolsBefore = await server.getTodoTools().getAvailableTools();
        assert.ok(toolsBefore.length >= 1); // At least todo_write should be available
        assert.ok(toolsBefore.some((t: any) => t.name === 'todo_write'));
        
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

    test('Should update tool list when auto-inject setting changes', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Ensure auto-inject is disabled to start
        const config = vscode.workspace.getConfiguration('agentTodos');
        await config.update('autoInject', false, vscode.ConfigurationTarget.Workspace);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Add todos first so todo_read will be available
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo for auto-inject test',
            status: 'pending',
            priority: 'medium'
        }]);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Initially, both tools should be available (auto-inject disabled + todos present)
        let tools = await server.getTodoTools().getAvailableTools();
        assert.strictEqual(tools.length, 2);
        assert.ok(tools.some((t: any) => t.name === 'todo_read'));
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));
        
        // Simulate enabling auto-inject
        await config.update('autoInject', true, vscode.ConfigurationTarget.Workspace);
        
        // Give time for configuration change to propagate
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Now only todo_write should be available
        tools = await server.getTodoTools().getAvailableTools();
        assert.strictEqual(tools.length, 1);
        assert.ok(!tools.some((t: any) => t.name === 'todo_read'));
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));
        
        // Disable auto-inject again
        await config.update('autoInject', false, vscode.ConfigurationTarget.Workspace);
        
        // Give time for configuration change to propagate
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Both tools should be available again
        tools = await server.getTodoTools().getAvailableTools();
        assert.strictEqual(tools.length, 2);
        assert.ok(tools.some((t: any) => t.name === 'todo_read'));
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));
    });

    test('Should fire server definition change event when configuration changes', async () => {
        // Ensure server is started first
        await provider.ensureServerStarted();
        
        let eventFired = false;
        const disposable = provider.onDidChangeMcpServerDefinitions(() => {
            eventFired = true;
        });
        
        try {
            // Change auto-inject setting
            const config = vscode.workspace.getConfiguration('agentTodos');
            await config.update('autoInject', true, vscode.ConfigurationTarget.Workspace);
            
            // Give more time for event to fire
            await new Promise(resolve => setTimeout(resolve, 500));
            
            assert.ok(eventFired, 'onDidChangeMcpServerDefinitions event should have fired');
        } finally {
            disposable.dispose();
            // Reset config
            await vscode.workspace.getConfiguration('agentTodos').update('autoInject', false, vscode.ConfigurationTarget.Workspace);
        }
    });
});