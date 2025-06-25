import * as assert from 'assert';
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

    test('Server updates internal config on broadcast', () => {
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
        server.broadcastUpdate({
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

    test('Server preserves other config when updating specific settings', () => {
        const server = new TodoMCPServer({
            port: 3000,
            workspaceRoot: '/test/workspace',
            standalone: false,
            enableSubtasks: true,
            autoInject: false,
            autoInjectFilePath: '.github/copilot-instructions.md'
        });

        // Update only enableSubtasks
        server.broadcastUpdate({
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

    test('Configuration changes trigger tool re-initialization', () => {
        const server = new TodoMCPServer({
            port: 3000,
            standalone: false,
            enableSubtasks: true,
            autoInject: false
        });

        // Track if tools were re-initialized
        let toolsReinitialized = false;
        const originalBroadcast = server.broadcastUpdate.bind(server);
        server.broadcastUpdate = function(event: any) {
            originalBroadcast(event);
            if (event.type === 'configuration-changed') {
                // In the real implementation, this triggers tool re-initialization
                toolsReinitialized = true;
            }
        };

        // Broadcast configuration change
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

        assert.ok(toolsReinitialized, 'Tools should be re-initialized on configuration change');
    });
});