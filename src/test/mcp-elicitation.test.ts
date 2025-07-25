import * as assert from 'assert';
import { TodoMCPServer } from '../mcp/server';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoTools } from '../mcp/tools/todoTools';
import { TodoItem } from '../types';

suite('MCP Elicitation for Title Change Tests', () => {
    let todoManager: StandaloneTodoManager;
    let mockServer: TodoMCPServer;
    let todoTools: TodoTools;
    let mockMcpServer: any;
    let elicitInputCalls: any[];

    setup(() => {
        const storage = new InMemoryStorage();
        todoManager = new StandaloneTodoManager(storage);
        mockServer = new TodoMCPServer({ standalone: true });
        mockServer.setTodoManager(todoManager);

        // Mock the MCP server with elicitInput capability
        elicitInputCalls = [];
        mockMcpServer = {
            server: {
                elicitInput: async (params: any) => {
                    elicitInputCalls.push(params);
                    
                    // Default mock response - can be overridden in individual tests
                    return {
                        action: "accept",
                        content: {
                            action: "yes_archive"
                        }
                    };
                }
            }
        };

        // Override getMcpServer to return our mock
        mockServer.getMcpServer = () => mockMcpServer;

        todoTools = new TodoTools(todoManager, mockServer);
    });

    teardown(async () => {
        await todoManager.updateTodos([]);
        elicitInputCalls.length = 0;
    });

    test('Should trigger elicitation when title changes from existing to new', async () => {
        // Set up initial state with a title
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation explicitly enabled
        const serverWithEnabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: true
        });
        serverWithEnabledElicitation.setTodoManager(todoManager);
        serverWithEnabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithEnabled = new TodoTools(todoManager, serverWithEnabledElicitation);

        // Mock user choosing to archive
        mockMcpServer.server.elicitInput = async (params: any) => {
            elicitInputCalls.push(params);
            return {
                action: "accept",
                content: {
                    action: "yes_archive"
                }
            };
        };

        // Update with new title - should trigger elicitation
        const result = await todoToolsWithEnabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New Title'
        });

        // Verify elicitation was called
        assert.strictEqual(elicitInputCalls.length, 1, 'Elicitation should be called once');
        
        const elicitCall = elicitInputCalls[0];
        assert.ok(elicitCall.message.includes('Original Title'), 'Should include original title in message');
        assert.ok(elicitCall.message.includes('New Title'), 'Should include new title in message');
        assert.strictEqual(elicitCall.requestedSchema.properties.action.enum.length, 2, 'Should have 2 action options');

        // Verify new title was applied
        assert.strictEqual(todoManager.getTitle(), 'New Title', 'Should use new title when user accepts');
        assert.ok(!result.isError, 'Should not return error');
    });

    test('Should not trigger elicitation when no title change', async () => {
        // Set up initial state with a title
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Same Title');

        // Update with same title - should not trigger elicitation
        await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo updated',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'Same Title'
        });

        // Verify elicitation was NOT called
        assert.strictEqual(elicitInputCalls.length, 0, 'Elicitation should not be called for same title');
    });

    test('Should not trigger elicitation when no previous title exists', async () => {
        // No initial title set
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }]);

        // Set title for first time - should not trigger elicitation
        await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'First Title'
        });

        // Verify elicitation was NOT called
        assert.strictEqual(elicitInputCalls.length, 0, 'Elicitation should not be called when setting title for first time');
        assert.strictEqual(todoManager.getTitle(), 'First Title', 'Should set first title normally');
    });

    test('Should cancel entire update when user chooses "reject"', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Original test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation explicitly enabled
        const serverWithEnabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: true
        });
        serverWithEnabledElicitation.setTodoManager(todoManager);
        serverWithEnabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithEnabled = new TodoTools(todoManager, serverWithEnabledElicitation);

        // Mock user choosing to reject the update
        mockMcpServer.server.elicitInput = async (params: any) => {
            elicitInputCalls.push(params);
            return {
                action: "accept",
                content: {
                    action: "reject"
                }
            };
        };

        // Try to change title and todo content
        const result = await todoToolsWithEnabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Updated test todo',
                status: 'in_progress',
                priority: 'high'
            }],
            title: 'New Title'
        });

        // Verify the entire operation was cancelled
        assert.strictEqual(todoManager.getTitle(), 'Original Title', 'Should keep original title when user rejects');
        const todos = todoManager.getTodos();
        assert.strictEqual(todos.length, 1, 'Should keep original todos');
        assert.strictEqual(todos[0].content, 'Original test todo', 'Should keep original todo content');
        assert.strictEqual(todos[0].status, 'pending', 'Should keep original todo status');
        assert.strictEqual(todos[0].priority, 'medium', 'Should keep original todo priority');
        assert.strictEqual(elicitInputCalls.length, 1, 'Elicitation should be called once');
        
        // Verify the response indicates cancellation
        assert.ok(result.content[0].text.includes('cancelled'), 'Response should indicate cancellation');
    });

    test('Should handle user declining/cancelling elicitation', async () => {
    });

    test('Should cancel entire update when user cancels', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Original test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation explicitly enabled
        const serverWithEnabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: true
        });
        serverWithEnabledElicitation.setTodoManager(todoManager);
        serverWithEnabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithEnabled = new TodoTools(todoManager, serverWithEnabledElicitation);

        // Mock user cancelling
        mockMcpServer.server.elicitInput = async (params: any) => {
            elicitInputCalls.push(params);
            return {
                action: "cancel"
            };
        };

        // Try to change title and todo content
        const result = await todoToolsWithEnabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Updated test todo',
                status: 'in_progress',
                priority: 'high'
            }],
            title: 'New Title'
        });

        // Verify the entire operation was cancelled
        assert.strictEqual(todoManager.getTitle(), 'Original Title', 'Should keep original title when user cancels');
        const todos = todoManager.getTodos();
        assert.strictEqual(todos.length, 1, 'Should keep original todos');
        assert.strictEqual(todos[0].content, 'Original test todo', 'Should keep original todo content');
        assert.strictEqual(todos[0].status, 'pending', 'Should keep original todo status');
        assert.strictEqual(todos[0].priority, 'medium', 'Should keep original todo priority');
        assert.strictEqual(elicitInputCalls.length, 1, 'Elicitation should be called once');
        
        // Verify the response indicates cancellation
        assert.ok(result.content[0].text.includes('cancelled'), 'Response should indicate cancellation');
    });

    test('Should handle elicitation error gracefully', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation explicitly enabled
        const serverWithEnabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: true
        });
        serverWithEnabledElicitation.setTodoManager(todoManager);
        serverWithEnabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithEnabled = new TodoTools(todoManager, serverWithEnabledElicitation);

        // Mock elicitation throwing an error
        mockMcpServer.server.elicitInput = async (params: any) => {
            elicitInputCalls.push(params);
            throw new Error('Elicitation failed');
        };

        // Try to change title
        const result = await todoToolsWithEnabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New Title'
        });

        // Verify new title was used as fallback
        assert.strictEqual(todoManager.getTitle(), 'New Title', 'Should use new title as fallback on error');
        assert.ok(!result.isError, 'Should not return error when elicitation fails');
        assert.strictEqual(elicitInputCalls.length, 1, 'Elicitation should be attempted once');
    });

    test('Should handle missing MCP server gracefully', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Mock no MCP server available
        mockServer.getMcpServer = () => null;

        // Try to change title
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New Title'
        });

        // Verify new title was used as fallback
        assert.strictEqual(todoManager.getTitle(), 'New Title', 'Should use new title when MCP server not available');
        assert.ok(!result.isError, 'Should not return error when MCP server not available');
        assert.strictEqual(elicitInputCalls.length, 0, 'Elicitation should not be called when server not available');
    });

    test('Should skip elicitation when enableElicitation is disabled', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation disabled
        const serverWithDisabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: false
        });
        serverWithDisabledElicitation.setTodoManager(todoManager);
        serverWithDisabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithDisabled = new TodoTools(todoManager, serverWithDisabledElicitation);

        // Try to change title - should not trigger elicitation
        const result = await todoToolsWithDisabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New Title'
        });

        // Verify elicitation was NOT called
        assert.strictEqual(elicitInputCalls.length, 0, 'Elicitation should not be called when disabled');
        assert.strictEqual(todoManager.getTitle(), 'New Title', 'Should use new title without prompting');
        assert.ok(!result.isError, 'Should not return error');
    });

    test('Should trigger elicitation when enableElicitation is explicitly enabled', async () => {
        // Set up initial state
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }], 'Original Title');

        // Create server with elicitation explicitly enabled
        const serverWithEnabledElicitation = new TodoMCPServer({
            standalone: true,
            enableElicitation: true
        });
        serverWithEnabledElicitation.setTodoManager(todoManager);
        serverWithEnabledElicitation.getMcpServer = () => mockMcpServer;

        const todoToolsWithEnabled = new TodoTools(todoManager, serverWithEnabledElicitation);

        // Try to change title - should trigger elicitation
        const result = await todoToolsWithEnabled.handleToolCall('todo_write', {
            todos: [{
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }],
            title: 'New Title'
        });

        // Verify elicitation was called
        assert.strictEqual(elicitInputCalls.length, 1, 'Elicitation should be called when enabled');
        assert.strictEqual(todoManager.getTitle(), 'New Title', 'Should use new title after confirmation');
        assert.ok(!result.isError, 'Should not return error');
    });
});
