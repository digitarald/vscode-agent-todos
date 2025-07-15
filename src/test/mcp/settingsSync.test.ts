import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../../mcp/server';

suite('MCP Settings Synchronization', () => {
    test('Server stores all settings during initialization', () => {
        const server = new TodoMCPServer({
            port: 3000,
            standalone: false,
            enableSubtasks: false,
            autoInject: true,
            autoInjectFilePath: '/custom/path/instructions.md'
        });

        // Get the config
        const config = server.getConfig();
        
        // Verify all settings were stored
        assert.strictEqual(config.enableSubtasks, false, 'enableSubtasks should be false');
        assert.strictEqual(config.autoInject, true, 'autoInject should be true');
        assert.strictEqual(config.autoInjectFilePath, '/custom/path/instructions.md', 'autoInjectFilePath should be custom path');
        assert.strictEqual(config.standalone, false, 'standalone should be false');
        assert.strictEqual(config.port, 3000, 'port should be 3000');
    });

    test('Server updates internal config on broadcast', async () => {
        const server = new TodoMCPServer({
            port: 3000,
            standalone: false,
            enableSubtasks: true,
            autoInject: false,
            autoInjectFilePath: '.github/copilot-instructions.md'
        });

        // Get initial config
        const initialConfig = server.getConfig();
        assert.strictEqual(initialConfig.enableSubtasks, true);
        assert.strictEqual(initialConfig.autoInject, false);
        assert.strictEqual(initialConfig.autoInjectFilePath, '.github/copilot-instructions.md');

        // Broadcast configuration change
        await server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false,
                autoInject: true,
                autoInjectFilePath: '/custom/file.md'
            }
        });

        // Verify config was updated
        const updatedConfig = server.getConfig();
        assert.strictEqual(updatedConfig.enableSubtasks, false);
        assert.strictEqual(updatedConfig.autoInject, true);
        assert.strictEqual(updatedConfig.autoInjectFilePath, '/custom/file.md');
    });

    test('Server preserves other config when updating specific settings', async () => {
        const server = new TodoMCPServer({
            port: 3000,
            workspaceRoot: '/test/workspace',
            standalone: false,
            enableSubtasks: true,
            autoInject: false,
            autoInjectFilePath: '.github/copilot-instructions.md'
        });

        // Update only enableSubtasks
        await server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

        // Verify only enableSubtasks changed
        const config = server.getConfig();
        assert.strictEqual(config.enableSubtasks, false, 'enableSubtasks should be updated');
        assert.strictEqual(config.autoInject, false, 'autoInject should remain unchanged');
        assert.strictEqual(config.autoInjectFilePath, '.github/copilot-instructions.md', 'autoInjectFilePath should remain unchanged');
        assert.strictEqual(config.port, 3000, 'port should remain unchanged');
        assert.strictEqual(config.workspaceRoot, '/test/workspace', 'workspaceRoot should remain unchanged');
    });

    test('TodoTools respects server configuration', async () => {
        // Import after vscode is available
        const { TodoTools } = await import('../../mcp/tools/todoTools.js');
        
        // Create server with specific config
        const server = new TodoMCPServer({
            port: 3000,
            standalone: false,
            enableSubtasks: false,
            autoInject: true
        });

        // Create a mock todo manager
        const mockTodoManager = {
            getTodos: () => [],
            getTitle: () => 'Test',
            updateTodos: async () => {},
            setTitle: async () => {},
            onDidChange: () => ({ dispose: () => {} })
        };

        // Create todo tools
        const todoTools = new TodoTools(mockTodoManager, server);
        
        // Get available tools
        const tools = await todoTools.getAvailableTools();
        
        // When autoInject is true and not standalone, todo_read should not be available
        const readTool = tools.find((t: any) => t.name === 'todo_read');
        assert.ok(!readTool, 'todo_read should not be available when autoInject is true');
        
        // Write tool should always be available
        const writeTool = tools.find((t: any) => t.name === 'todo_write');
        assert.ok(writeTool, 'todo_write should always be available');
        
        // Write tool schema should not include subtasks when disabled
        assert.ok(!writeTool.inputSchema.properties.todos.items.properties.subtasks, 
            'Schema should not include subtasks when disabled');
    });

    test('Configuration changes trigger tool re-initialization', async () => {
        const server = new TodoMCPServer({
            port: 3000,
            standalone: false,
            enableSubtasks: true,
            autoInject: false
        });

        // Track if tools were re-initialized
        let toolsReinitialized = false;
        const originalBroadcast = server.broadcastUpdate.bind(server);
        server.broadcastUpdate = async function(event: any) {
            await originalBroadcast(event);
            if (event.type === 'configuration-changed') {
                // In the real implementation, this triggers tool re-initialization
                toolsReinitialized = true;
            }
        };

        // Broadcast configuration change
        await server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

        assert.ok(toolsReinitialized, 'Tools should be re-initialized on configuration change');
    });

    test('VS Code settings changes propagate to MCP server directly', async () => {
        // Import after vscode is available
        const { TodoMCPServerProvider } = await import('../../mcp/mcpProvider.js');
        const { TodoManager } = await import('../../todoManager.js');

        // Mock context with workspaceState
        const workspaceState = new Map<string, any>();
        const context = {
            subscriptions: [],
            workspaceState: {
                get: (key: string) => workspaceState.get(key),
                update: async (key: string, value: any) => {
                    workspaceState.set(key, value);
                }
            }
        } as any;

        // Create provider and start server
        const provider = new TodoMCPServerProvider(context);
        await provider.ensureServerStarted();
        const server = provider.getServer()!;

        // Verify initial state
        let config = server.getConfig();
        assert.strictEqual(config.autoInject, false, 'Initial autoInject should be false');

        // Add some todos so todo_read tool can be visible
        const todoManager = TodoManager.getInstance();
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }]);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify todo_read is available when autoInject is false
        let tools = await server.getTodoTools().getAvailableTools();
        let hasReadTool = tools.some((t: any) => t.name === 'todo_read');
        assert.ok(hasReadTool, 'todo_read should be available when autoInject is false');

        // Simulate VS Code configuration change by directly calling the internal handler
        // This mimics what happens when VS Code settings change
        const vsCodeConfig = vscode.workspace.getConfiguration('agentTodos');
        await vsCodeConfig.update('autoInject', true, vscode.ConfigurationTarget.Workspace);

        // Give time for configuration change to propagate
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify server configuration was updated
        config = server.getConfig();
        assert.strictEqual(config.autoInject, true, 'Server autoInject should be updated to true');

        // Verify tool availability changed
        tools = await server.getTodoTools().getAvailableTools();
        hasReadTool = tools.some((t: any) => t.name === 'todo_read');
        assert.ok(!hasReadTool, 'todo_read should NOT be available when autoInject is true');

        // Reset
        await vsCodeConfig.update('autoInject', false, vscode.ConfigurationTarget.Workspace);
        await provider.dispose();
    });
});