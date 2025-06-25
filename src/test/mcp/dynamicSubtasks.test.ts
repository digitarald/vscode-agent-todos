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
            standalone: false,
            enableSubtasks: true
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
        // Initially subtasks are enabled (from setup)
        let todoTools = server.getTodoTools();
        let tools = await todoTools.getAvailableTools();
        let writeTool = tools.find(t => t.name === 'todo_write');
        
        assert.ok(writeTool, 'Write tool should exist');
        assert.ok(writeTool.inputSchema.properties.todos.items.properties.subtasks, 'Schema should include subtasks when enabled');
        assert.ok(writeTool.description.includes('<subtasks>'), 'Write tool description should mention subtasks when enabled');

        // Disable subtasks via configuration update
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

        // Get tools again after configuration change
        todoTools = server.getTodoTools();
        tools = await todoTools.getAvailableTools();
        writeTool = tools.find(t => t.name === 'todo_write');
        
        assert.ok(writeTool, 'Write tool should still exist');
        assert.ok(!writeTool.inputSchema.properties.todos.items.properties.subtasks, 'Schema should not include subtasks when disabled');
        assert.ok(!writeTool.description.includes('<subtasks>'), 'Write tool description should not mention subtasks when disabled');

        // Re-enable subtasks
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: true
            }
        });

        // Verify tools are updated again
        todoTools = server.getTodoTools();
        tools = await todoTools.getAvailableTools();
        writeTool = tools.find(t => t.name === 'todo_write');
        
        assert.ok(writeTool, 'Write tool should still exist');
        assert.ok(writeTool.inputSchema.properties.todos.items.properties.subtasks, 'Schema should include subtasks again when re-enabled');
        assert.ok(writeTool.description.includes('<subtasks>'), 'Write tool description should mention subtasks again when re-enabled');
    });

    test('Tool descriptions update based on subtasks setting', async () => {
        const todoTools = server.getTodoTools();

        // Test with subtasks enabled (from setup)
        let tools = await todoTools.getAvailableTools();
        let writeTool = tools.find(t => t.name === 'todo_write');
        assert.ok(writeTool?.description.includes('<subtasks>'), 'Write tool description should mention subtasks when enabled');

        // Disable subtasks
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

        tools = await todoTools.getAvailableTools();
        writeTool = tools.find(t => t.name === 'todo_write');
        assert.ok(!writeTool?.description.includes('<subtasks>'), 'Write tool description should not mention subtasks when disabled');
    });

    test('Subtasks validation respects current configuration', async () => {
        // Update server configuration to disable subtasks
        server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                enableSubtasks: false
            }
        });

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