import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../../mcp/server';
import { TodoManager } from '../../todoManager';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { StandaloneTodoManager } from '../../mcp/standaloneTodoManager';

suite('MCP Dynamic Subtasks Configuration', () => {
    let server: TodoMCPServer;
    let todoManager: StandaloneTodoManager;
    let originalGetConfig: any;

    setup(async () => {
        // Store original getConfiguration function
        originalGetConfig = vscode.workspace.getConfiguration;

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

    test('Tool schemas update when subtasks setting changes', async () => {
        let subtasksEnabled = true;

        // Mock the getConfiguration to control the subtasks setting
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                // Override the get method for our test
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'enableSubtasks') {
                            return subtasksEnabled;
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };

        // Get initial tools with subtasks enabled
        const todoTools = server.getTodoTools();
        let tools = await todoTools.getAvailableTools();
        let writeToolSchema = tools.find(t => t.name === 'todo_write')?.inputSchema;
        assert.ok(writeToolSchema.properties.todos.items.properties.subtasks, 'Schema should include subtasks when enabled');
        assert.ok(writeToolSchema.properties.todos.items.properties.adr, 'Schema should include adr when subtasks enabled');

        // Disable subtasks
        subtasksEnabled = false;

        // Simulate configuration change broadcast
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                autoInject: false,
                enableSubtasks: false
            },
            timestamp: Date.now()
        });

        // Get tools again after configuration change
        tools = await todoTools.getAvailableTools();
        writeToolSchema = tools.find(t => t.name === 'todo_write')?.inputSchema;
        assert.ok(!writeToolSchema.properties.todos.items.properties.subtasks, 'Schema should not include subtasks when disabled');
        assert.ok(writeToolSchema.properties.todos.items.properties.adr, 'Schema should always include adr (independent of subtasks setting)');

        // Re-enable subtasks
        subtasksEnabled = true;

        // Simulate configuration change broadcast again
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                autoInject: false,
                enableSubtasks: true
            },
            timestamp: Date.now()
        });

        // Verify tools are updated again
        tools = await todoTools.getAvailableTools();
        writeToolSchema = tools.find(t => t.name === 'todo_write')?.inputSchema;
        assert.ok(writeToolSchema.properties.todos.items.properties.subtasks, 'Schema should include subtasks again when re-enabled');
        assert.ok(writeToolSchema.properties.todos.items.properties.adr, 'Schema should always include adr (independent of subtasks setting)');
    });

    test('Tool descriptions update based on subtasks setting', async () => {
        let subtasksEnabled = true;

        // Mock the getConfiguration
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'enableSubtasks') {
                            return subtasksEnabled;
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };

        const todoTools = server.getTodoTools();

        // Test with subtasks enabled
        let tools = await todoTools.getAvailableTools();
        let writeTool = tools.find(t => t.name === 'todo_write');
        assert.ok(writeTool?.description.includes('<subtasks>'), 'Write tool description should mention subtasks when enabled');

        // Disable subtasks
        subtasksEnabled = false;

        // Broadcast configuration change
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                autoInject: false,
                enableSubtasks: false
            },
            timestamp: Date.now()
        });

        tools = await todoTools.getAvailableTools();
        writeTool = tools.find(t => t.name === 'todo_write');
        assert.ok(!writeTool?.description.includes('<subtasks>'), 'Write tool description should not mention subtasks when disabled');
    });

    test('Subtasks validation respects current configuration', async () => {
        let subtasksEnabled = false;

        // Mock the getConfiguration to disable subtasks
        vscode.workspace.getConfiguration = (section?: string) => {
            const config = originalGetConfig(section);
            if (section === 'agentTodos') {
                return {
                    ...config,
                    get: (key: string, defaultValue?: any) => {
                        if (key === 'enableSubtasks') {
                            return subtasksEnabled;
                        }
                        return config.get(key, defaultValue);
                    }
                };
            }
            return config;
        };

        const todoTools = server.getTodoTools();

        // Try to write a todo with subtasks
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test task',
                status: 'pending',
                priority: 'medium',
                subtasks: [{
                    id: 'sub-1',
                    content: 'Subtask 1',
                    status: 'pending'
                }]
            }]
        });

        assert.ok(result.isError, 'Should error when trying to use subtasks while disabled');
        assert.ok(result.content[0].text.includes('Subtasks are disabled'), 'Error message should mention subtasks are disabled');
    });
});