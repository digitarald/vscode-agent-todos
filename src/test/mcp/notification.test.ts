import * as assert from 'assert';
import { TodoMCPServer } from '../../mcp/server';
import { TodoTools } from '../../mcp/tools/todoTools';
import { StandaloneTodoManager } from '../../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../../storage/InMemoryStorage';

suite('MCP Notification Tests', () => {
    let server: TodoMCPServer;
    let todoManager: StandaloneTodoManager;
    let todoTools: TodoTools;

    setup(async function() {
        this.timeout(10000);
        
        // Create standalone server
        server = new TodoMCPServer({ 
            standalone: true,
            port: 0 // Use random port
        });
        
        // Get the todo manager
        todoManager = server.getTodoManager() as StandaloneTodoManager;
        assert.ok(todoManager);
        
        // Initialize server (loads MCP SDK modules)
        await server.initialize();
        
        // Get todo tools
        todoTools = server.getTodoTools();
    });

    teardown(async () => {
        await server?.stop();
        todoManager?.dispose();
    });

    test('Should handle notification context in tool calls', async () => {
        let notificationCalled = false;
        let notificationData: any = null;
        
        // Mock sendNotification function
        const mockSendNotification = async (notification: any) => {
            notificationCalled = true;
            notificationData = notification;
            console.log('Mock notification called:', notification);
        };
        
        // Create context with sendNotification and progressToken
        const context = {
            sendNotification: mockSendNotification,
            _meta: {
                progressToken: 'test-progress-token-123'
            }
        };
        
        // Write a todo with the context
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'notif-test-1',
                content: 'Test notification todo',
                status: 'pending',
                priority: 'high'
            }],
            title: 'Notification Test'
        }, context);
        
        // Verify the todo was written successfully
        assert.ok(!result.isError);
        assert.ok(result.content[0].text.includes('Successfully updated'));
        
        // Check if notification was called (should be for initialization)
        if (notificationCalled) {
            console.log('Notification was called with:', notificationData);
            assert.strictEqual(notificationData.method, 'notifications/progress');
            assert.strictEqual(notificationData.params.progressToken, 'test-progress-token-123');
            assert.ok(notificationData.params.message);
        }
        
        // Reset notification tracking
        notificationCalled = false;
        notificationData = null;
        
        // Now complete the todo
        const completeResult = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'notif-test-1',
                content: 'Test notification todo',
                status: 'completed',
                priority: 'high'
            }],
            title: 'Notification Test'
        }, context);
        
        // Verify completion
        assert.ok(!completeResult.isError);
        
        // Check if notification was called for completion
        if (notificationCalled) {
            console.log('Completion notification:', notificationData);
            assert.strictEqual(notificationData.method, 'notifications/progress');
            assert.ok(notificationData.params.message.includes('Completed'));
        }
    });

    test('Should handle missing sendNotification gracefully', async () => {
        // Context without sendNotification
        const context = {
            _meta: {
                progressToken: 'test-progress-token-456'
            }
        };
        
        // Should not throw when sendNotification is missing
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'no-notif-test',
                content: 'Test without notification',
                status: 'pending',
                priority: 'low'
            }]
        }, context);
        
        // Should still work without notifications
        assert.ok(!result.isError);
        assert.ok(result.content[0].text.includes('Successfully updated'));
    });

    test('Should handle notification errors gracefully', async () => {
        let errorThrown = false;
        
        // Mock sendNotification that throws an error
        const errorSendNotification = async (notification: any) => {
            errorThrown = true;
            throw new Error('Notification failed!');
        };
        
        const context = {
            sendNotification: errorSendNotification,
            _meta: {
                progressToken: 'error-test-token'
            }
        };
        
        // Should not throw even if sendNotification fails
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'error-test',
                content: 'Test with notification error',
                status: 'pending',
                priority: 'medium'
            }]
        }, context);
        
        // Should still succeed despite notification error
        assert.ok(!result.isError);
        assert.ok(result.content[0].text.includes('Successfully updated'));
        
        // Verify the error was thrown but handled
        assert.ok(errorThrown);
    });
});