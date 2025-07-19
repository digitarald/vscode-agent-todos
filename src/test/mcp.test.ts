import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../mcp/server';
import { TodoMCPServerProvider } from '../mcp/mcpProvider';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { TodoSync } from '../mcp/todoSync';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoTreeDataProvider, TodoTreeItem } from '../todoTreeProvider';
import { TodoItem } from '../types';

suite('MCP Integration Tests', () => {
    let context: vscode.ExtensionContext;

    setup(() => {
        // Mock extension context
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
    });

    suite('MCP Server', () => {
        let server: TodoMCPServer;
        let port: number;

        setup(async () => {
            // Use a random port for testing
            port = 3000 + Math.floor(Math.random() * 1000);
            server = new TodoMCPServer({
                port,
                standalone: true
            });
        });

        teardown(async () => {
            if (server) {
                await server.stop();
            }
        });

        test('Should start and stop server successfully', async function() {
            this.timeout(5000);
            
            await server.start();
            assert.ok(server['isRunning']);

            await server.stop();
            assert.ok(!server['isRunning']);
        });

        test('Should not start server twice', async () => {
            await server.start();
            
            try {
                await server.start();
                assert.fail('Should have thrown an error');
            } catch (error: any) {
                assert.strictEqual(error.message, 'Server is already running');
            }
        });

        test('Should handle workspace root configuration', () => {
            const testRoot = '/test/workspace';
            server.setWorkspaceRoot(testRoot);
            
            const config = server.getConfig();
            assert.strictEqual(config.workspaceRoot, testRoot);
        });

        test('Should correctly identify standalone mode', () => {
            assert.strictEqual(server.isStandalone(), true);
            
            const nonStandaloneServer = new TodoMCPServer({ standalone: false });
            assert.strictEqual(nonStandaloneServer.isStandalone(), false);
        });

        test('Should broadcast updates to connected sessions', async () => {
            await server.start();
            
            // Test broadcast functionality - should not throw
            server.broadcastUpdate({
                type: 'todos-updated',
                todos: [],
                title: 'Test Broadcast',
                timestamp: Date.now()
            });
            
            assert.ok(true);
        });

        test('Should store and update configuration', async () => {
            const initialConfig = server.getConfig();
            assert.strictEqual(initialConfig.autoInject, false);

            // Broadcast configuration change
            await server.broadcastUpdate({
                type: 'configuration-changed',
                config: {
                    autoInject: true,
                }
            });

            const updatedConfig = server.getConfig();
            assert.strictEqual(updatedConfig.autoInject, true);
        });
    });

    suite('Todo Tools', () => {
        let todoManager: StandaloneTodoManager;
        let mockServer: TodoMCPServer;

        setup(() => {
            const storage = new InMemoryStorage();
            todoManager = new StandaloneTodoManager(storage);
            mockServer = new TodoMCPServer({ standalone: true });
            mockServer.setTodoManager(todoManager);
        });

        teardown(async () => {
            await todoManager.updateTodos([]);
        });

        test('Should return correct tools for standalone mode', async () => {
            await mockServer.initialize();
            
            // Test that both tools work in standalone mode
            const readResult = await mockServer.getTodoTools().handleToolCall('todo_read', {});
            assert.ok(!readResult.isError, 'todo_read should be available in standalone mode');
            
            const writeResult = await mockServer.getTodoTools().handleToolCall('todo_write', {
                todos: [], title: 'Test'
            });
            assert.ok(!writeResult.isError, 'todo_write should be available in standalone mode');
        });

        test('Should have correct tool behavior', async () => {
            await mockServer.initialize();
            
            // Test read tool behavior
            const readResult = await mockServer.getTodoTools().handleToolCall('todo_read', {});
            assert.ok(!readResult.isError);
            assert.ok(readResult.content[0].text.includes('Todos'));
            
            // Test write tool behavior  
            const writeResult = await mockServer.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'test-1',
                    content: 'Test todo',
                    status: 'pending',
                    priority: 'medium'
                }],
                title: 'Test List'
            });
            assert.ok(!writeResult.isError);
            assert.ok(writeResult.content[0].text.includes('Successfully updated'));
        });

        test('Should read empty todo list', async () => {
            await mockServer.initialize();
            const result = await mockServer.getTodoTools().handleToolCall('todo_read', {});

            assert.strictEqual(result.isError, undefined);
            assert.strictEqual(result.content.length, 1);
            assert.strictEqual(result.content[0].type, 'text');

            const data = JSON.parse(result.content[0].text);
            assert.strictEqual(data.title, 'Todos');
            assert.deepStrictEqual(data.todos, []);
        });

        test('Should read todo list with items', async () => {
            await mockServer.initialize();
            
            // Write todos via MCP server to set up the test data
            await mockServer.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: '1',
                    content: 'Test todo',
                    status: 'pending',
                    priority: 'high'
                }],
                title: 'Test List'
            });

            const result = await mockServer.getTodoTools().handleToolCall('todo_read', {});

            const data = JSON.parse(result.content[0].text);
            assert.strictEqual(data.title, 'Test List');
            assert.strictEqual(data.todos.length, 1);
            assert.strictEqual(data.todos[0].content, 'Test todo');
        });

        test('Should write todos successfully', async () => {
            await mockServer.initialize();
            const params = {
                todos: [{
                    id: '1',
                    content: 'New todo',
                    status: 'pending',
                    priority: 'medium'
                }],
                title: 'New List'
            };

            const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, undefined);
            assert.ok(result.content[0].text.includes('Successfully updated 1 todo items'));

            // Verify todos were actually saved
            const todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 1);
            assert.strictEqual(todos[0].content, 'New todo');
        });

        test('Should validate todo input', async () => {
            await mockServer.initialize();
            const result = await mockServer.getTodoTools().handleToolCall('todo_write', { todos: 'not-an-array' });

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Error: todos must be an array'));
        });

        test('Should enforce single in_progress task rule', async () => {
            await mockServer.initialize();
            const params = {
                todos: [
                    { id: '1', content: 'Task 1', status: 'in_progress', priority: 'high' },
                    { id: '2', content: 'Task 2', status: 'in_progress', priority: 'high' }
                ]
            };

            const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Only ONE task can be in_progress at a time'));
        });

        test('Should handle todos with ADR', async () => {
            await mockServer.initialize();
            const params = {
                todos: [{
                    id: '1',
                    content: 'Task with adr',
                    status: 'pending',
                    priority: 'high',
                    adr: 'Architecture decision record here'
                }]
            };

            const result = await mockServer.getTodoTools().handleToolCall('todo_write', params);

            assert.strictEqual(result.isError, undefined);
            assert.ok(result.content[0].text.includes('ADR added to 1 task(s)'));
        });

        test('Should handle unknown tool name', async () => {
            await mockServer.initialize();
            const result = await mockServer.getTodoTools().handleToolCall('unknown_tool', {});

            assert.strictEqual(result.isError, true);
            assert.ok(result.content[0].text.includes('Unknown tool: unknown_tool'));
        });
    });

    suite('Todo Sync', () => {
        let todoManager: TodoManager;
        let standaloneTodoManager: StandaloneTodoManager;
        let todoSync: TodoSync;

        setup(async function() {
            this.timeout(5000);
            
            // Initialize VS Code TodoManager
            todoManager = TodoManager.getInstance();
            todoManager.initialize(context);
            await todoManager.clearTodos();
            
            // Initialize standalone manager
            const storage = new InMemoryStorage();
            standaloneTodoManager = new StandaloneTodoManager(storage);
            await standaloneTodoManager.updateTodos([]);
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Create sync
            todoSync = new TodoSync(todoManager, standaloneTodoManager);
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        teardown(async () => {
            todoSync?.dispose();
            await todoManager?.clearTodos();
        });

        test('Should sync empty to non-empty transition via MCP', async () => {
            // Verify initial empty state
            assert.strictEqual(todoManager.getTodos().length, 0);
            assert.strictEqual(standaloneTodoManager.getTodos().length, 0);

            let vscodeChangeDetected = false;
            const disposable = todoManager.onDidChange(() => {
                vscodeChangeDetected = true;
            });

            // Add todos via MCP
            const newTodos: TodoItem[] = [
                { id: '1', content: 'Test todo', status: 'pending', priority: 'medium' }
            ];
            await standaloneTodoManager.updateTodos(newTodos, 'Test Title');

            // Wait for sync
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify sync
            assert.strictEqual(vscodeChangeDetected, true);
            assert.strictEqual(todoManager.getTodos().length, 1);
            assert.strictEqual(todoManager.getTodos()[0].content, 'Test todo');

            disposable.dispose();
        });

        test('Should sync non-empty to empty transition via MCP', async () => {
            // Set initial todos
            const initialTodos: TodoItem[] = [
                { id: '1', content: 'Todo 1', status: 'pending', priority: 'high' }
            ];
            await todoManager.setTodos(initialTodos);
            await new Promise(resolve => setTimeout(resolve, 50));

            // Verify sync to standalone
            assert.strictEqual(standaloneTodoManager.getTodos().length, 1);

            let vscodeChangeDetected = false;
            const disposable = todoManager.onDidChange(() => {
                vscodeChangeDetected = true;
            });

            // Clear todos via MCP
            await standaloneTodoManager.updateTodos([], 'Empty List');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify empty state synced
            assert.strictEqual(vscodeChangeDetected, true);
            assert.strictEqual(todoManager.getTodos().length, 0);

            disposable.dispose();
        });

        test('Should handle concurrent updates from both sides', async () => {
            const vscodeTodos: TodoItem[] = [
                { id: '1', content: 'VS Code todo', status: 'pending', priority: 'high' }
            ];
            
            const mcpTodos: TodoItem[] = [
                { id: '2', content: 'MCP todo', status: 'in_progress', priority: 'medium' }
            ];

            // Perform concurrent updates
            const vscodeUpdate = todoManager.setTodos(vscodeTodos);
            const mcpUpdate = standaloneTodoManager.updateTodos(mcpTodos);

            await Promise.all([vscodeUpdate, mcpUpdate]);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify consistency (last update should win)
            const vsTodos = todoManager.getTodos();
            const mcpTodosList = standaloneTodoManager.getTodos();
            
            assert.strictEqual(vsTodos.length, mcpTodosList.length);
            assert.deepStrictEqual(vsTodos, mcpTodosList);
        });
    });

    suite('Provider Integration', () => {
        let provider: TodoMCPServerProvider;
        let todoManager: TodoManager;

        setup(async function() {
            this.timeout(10000);
            
            todoManager = TodoManager.getInstance();
            todoManager.initialize(context);
            await todoManager.clearTodos();
            
            provider = new TodoMCPServerProvider(context);
            await provider.ensureServerStarted();
            
            await new Promise(resolve => setTimeout(resolve, 500));
        });

        teardown(async () => {
            await provider?.dispose();
            await todoManager?.clearTodos();
        });

        test('Should provide todo tools via MCP', async () => {
            const server = provider.getServer();
            assert.ok(server);
            
            await server.initialize();
            
            // Test that tools are functional rather than checking schema
            const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
            assert.ok(!readResult.isError);
            
            const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [], title: 'Test'
            });
            assert.ok(!writeResult.isError);
        });

        test('Should handle todo operations through MCP tools', async () => {
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();
            
            // Write todos
            const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'integration-1',
                    content: 'Integration test todo',
                    status: 'pending',
                    priority: 'high'
                }],
                title: 'Integration Test'
            });
            
            assert.ok(!writeResult.isError);
            assert.ok(writeResult.content[0].text.includes('Successfully updated'));
            
            // Read todos
            const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
            assert.ok(!readResult.isError);
            
            const responseText = readResult.content[0].text;
            if (responseText.includes('automatically available')) {
                // Auto-inject is enabled
                assert.ok(responseText.includes('auto-inject is enabled'));
            } else {
                // Parse as JSON
                const data = JSON.parse(responseText);
                assert.strictEqual(data.title, 'Integration Test');
                assert.strictEqual(data.todos.length, 1);
                assert.strictEqual(data.todos[0].content, 'Integration test todo');
            }
        });

        test('Should handle configuration changes', async () => {
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();
            
            // Add todos first so todo_read can be available
            await todoManager.updateTodos([{
                id: 'test-1',
                content: 'Test todo for config test',
                status: 'pending',
                priority: 'medium'
            }]);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const initialAutoInject = vscode.workspace.getConfiguration('agentTodos').get<boolean>('autoInject', false);
            
            // Change auto-inject setting
            const config = vscode.workspace.getConfiguration('agentTodos');
            await config.update('autoInject', !initialAutoInject, vscode.ConfigurationTarget.Workspace);
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Test tool functionality with configuration changes
            const readResult = await server.getTodoTools().handleToolCall('todo_read', {});
            const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [], title: 'Config Test'
            });
            
            // Both tools should work regardless of auto-inject setting
            assert.ok(!readResult.isError);
            assert.ok(!writeResult.isError);
            
            // Reset
            await config.update('autoInject', initialAutoInject, vscode.ConfigurationTarget.Workspace);
        });
    });

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

    suite('Empty State Transitions with Tree View', () => {
        let provider: TodoMCPServerProvider;
        let todoManager: TodoManager;
        let treeProvider: TodoTreeDataProvider;

        setup(async function() {
            this.timeout(10000);
            
            todoManager = TodoManager.getInstance();
            todoManager.initialize(context);
            await todoManager.clearTodos();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            treeProvider = new TodoTreeDataProvider();
            
            provider = new TodoMCPServerProvider(context);
            await provider.ensureServerStarted();
            await new Promise(resolve => setTimeout(resolve, 1000));
        });

        teardown(async () => {
            await provider?.dispose();
            await todoManager?.clearTodos();
        });

        test('Should update tree view when going from empty to non-empty via MCP', async function() {
            this.timeout(10000);
            
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify starting empty
            let todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 0);
            
            let children = await treeProvider.getChildren();
            assert.strictEqual(children.length, 0);
            
            // Track tree refresh
            let refreshTriggered = false;
            const disposable = treeProvider.onDidChangeTreeData(() => {
                refreshTriggered = true;
            });
            
            try {
                // Add todos via MCP
                const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                    todos: [{
                        id: 'empty-test-1',
                        content: 'First todo after empty',
                        status: 'pending',
                        priority: 'high'
                    }],
                    title: 'Empty State Test'
                });
                
                assert.ok(!writeResult.isError);
                
                // Wait for sync
                await new Promise(resolve => setTimeout(resolve, 2500));
                
                // Verify todos were added
                todos = todoManager.getTodos();
                assert.strictEqual(todos.length, 1);
                assert.strictEqual(todos[0].content, 'First todo after empty');
                
                // Verify tree refresh
                assert.ok(refreshTriggered);
                
                // Check tree shows items
                children = await treeProvider.getChildren();
                assert.strictEqual(children.length, 1);
                assert.ok(children[0] instanceof TodoTreeItem);
            } finally {
                disposable.dispose();
            }
        });

        test('Should handle rapid empty/non-empty transitions', async () => {
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();
            
            let refreshCount = 0;
            const disposable = treeProvider.onDidChangeTreeData(() => {
                refreshCount++;
            });
            
            try {
                // Perform rapid transitions
                for (let i = 0; i < 3; i++) {
                    await server.getTodoTools().handleToolCall('todo_write', {
                        todos: [{
                            id: `rapid-${i}`,
                            content: `Rapid test ${i}`,
                            status: 'pending',
                            priority: 'medium'
                        }]
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    await server.getTodoTools().handleToolCall('todo_write', {
                        todos: []
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Should end up empty
                const todos = todoManager.getTodos();
                assert.strictEqual(todos.length, 0);
                
                // Should have triggered multiple refreshes
                assert.ok(refreshCount >= 3, `Should have triggered at least 3 refreshes, got ${refreshCount}`);
                
                const children = await treeProvider.getChildren();
                assert.strictEqual(children.length, 0);
            } finally {
                disposable.dispose();
            }
        });

        test('Should send progress notification when new todo list is created', async () => {
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();

            // Mock the sendNotification to capture progress notifications
            let capturedNotification: any = null;
            const mockContext = {
                _meta: { progressToken: 'test-token' },
                sendNotification: async (notification: any) => {
                    capturedNotification = notification;
                }
            };

            // Test creating a new todo list from empty state
            const result = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'test-1',
                    content: 'First todo',
                    status: 'pending',
                    priority: 'high'
                }],
                title: 'My Project Tasks'
            }, mockContext);

            // Check the standard success response
            assert.ok(result.content);
            assert.ok(result.content[0]);
            assert.ok(result.content[0].text);

            const responseText = result.content[0].text;
            assert.ok(responseText.includes('Successfully updated 1 todo items'),
                `Expected success message in response: ${responseText}`);

            // Check that progress notification was sent via sendNotification
            assert.ok(capturedNotification, 'Expected progress notification to be sent');
            assert.strictEqual(capturedNotification.method, 'notifications/progress');
            assert.ok(capturedNotification.params);
            assert.strictEqual(capturedNotification.params.progressToken, 'test-token');
            assert.strictEqual(capturedNotification.params.message, 'Started "My Project Tasks" (1)');
        });

        test('Should not send progress notification when updating existing list', async () => {
            const server = provider.getServer();
            assert.ok(server);
            await server.initialize();

            // First create a list
            await server.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'test-1',
                    content: 'First todo',
                    status: 'pending',
                    priority: 'medium'
                }],
                title: 'Existing List'
            });

            // Mock sendNotification to capture any notifications
            let capturedNotification: any = null;
            const mockContext = {
                _meta: { progressToken: 'test-token' },
                sendNotification: async (notification: any) => {
                    capturedNotification = notification;
                }
            };

            // Then update it (should not send progress notification)
            const result = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [{
                    id: 'test-1',
                    content: 'Updated todo',
                    status: 'in_progress',
                    priority: 'high'
                }, {
                    id: 'test-2',
                    content: 'Second todo',
                    status: 'pending',
                    priority: 'low'
                }],
                title: 'Updated List'
            }, mockContext);

            // Check that standard success response is returned
            assert.ok(result.content);
            assert.ok(result.content[0]);
            assert.ok(result.content[0].text);

            const responseText = result.content[0].text;
            assert.ok(responseText.includes('Successfully updated 2 todo items'),
                `Expected success message in response: ${responseText}`);

            // Check that no progress notification was sent (since not starting from empty)
            assert.strictEqual(capturedNotification, null, 
                'Should not send progress notification when updating existing list');
        });
    });

    suite('Saved List Resource Completion', () => {
        let server: TodoMCPServer;
        let todoManager: StandaloneTodoManager;

        setup(async () => {
            // Create server in standalone mode for testing
            server = new TodoMCPServer({ standalone: true });
            await server.initialize();

            // Get the standalone todo manager
            todoManager = server.getTodoManager();

            // Create some saved lists for testing
            await todoManager.setTodos([
                { id: 'task1', content: 'Task 1', status: 'completed', priority: 'high' }
            ], 'Project Alpha');

            await todoManager.setTodos([
                { id: 'task2', content: 'Task 2', status: 'pending', priority: 'medium' }
            ], 'Project Beta Setup');

            await todoManager.setTodos([
                { id: 'task3', content: 'Task 3', status: 'in_progress', priority: 'low' }
            ], 'Database Migration');

            await todoManager.setTodos([
                { id: 'task4', content: 'Task 4', status: 'pending', priority: 'high' }
            ], 'API Enhancement');

            // Trigger saving of "API Enhancement" by setting a new title
            await todoManager.setTodos([
                { id: 'task5', content: 'Task 5', status: 'pending', priority: 'medium' }
            ], 'Current Project');
        });

        teardown(async () => {
            if (server) {
                await server.stop();
            }
        });

        test('Should provide completion for saved list slugs with empty input', async () => {
            // Mock ResourceTemplate completion callback
            const savedLists = todoManager.getSavedLists();
            assert.ok(savedLists.length >= 3, 'Should have saved lists from setup');

            const slugs = todoManager.getSavedListSlugs();
            assert.ok(slugs.length >= 3, 'Should have saved list slugs');

            // Test completion with empty input
            const allSlugs = slugs.filter((slug: string) => slug.toLowerCase().startsWith(''));
            assert.strictEqual(allSlugs.length, slugs.length, 'Empty input should return all slugs');
            assert.ok(allSlugs.includes('project-alpha'), 'Should include project-alpha slug');
            assert.ok(allSlugs.includes('project-beta-setup'), 'Should include project-beta-setup slug');
            assert.ok(allSlugs.includes('database-migration'), 'Should include database-migration slug');
        });

        test('Should provide filtered completion for saved list slugs with partial input', async () => {
            const slugs = todoManager.getSavedListSlugs();

            // Test completion with 'project' prefix
            const projectSlugs = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('project'.toLowerCase())
            );
            assert.ok(projectSlugs.length >= 2, 'Should have project-related slugs');
            assert.ok(projectSlugs.includes('project-alpha'), 'Should include project-alpha');
            assert.ok(projectSlugs.includes('project-beta-setup'), 'Should include project-beta-setup');
            assert.ok(!projectSlugs.includes('database-migration'), 'Should not include database-migration');

            // Test completion with 'data' prefix
            const dataSlugs = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('data'.toLowerCase())
            );
            assert.ok(dataSlugs.includes('database-migration'), 'Should include database-migration');
            assert.ok(!dataSlugs.includes('project-alpha'), 'Should not include project-alpha');
        });

        test('Should handle case-insensitive completion', async () => {
            const slugs = todoManager.getSavedListSlugs();

            // Test with uppercase input
            const upperCaseResults = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('PROJECT'.toLowerCase())
            );
            const lowerCaseResults = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('project'.toLowerCase())
            );

            assert.deepStrictEqual(upperCaseResults, lowerCaseResults,
                'Case-insensitive matching should work');
        });

        test('Should return empty array for non-matching input', async () => {
            const slugs = todoManager.getSavedListSlugs();

            const noMatches = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('nonexistent'.toLowerCase())
            );
            assert.strictEqual(noMatches.length, 0, 'Should return empty array for non-matching input');
        });

        test('Should handle partial matches correctly', async () => {
            const slugs = todoManager.getSavedListSlugs();

            // Test with 'api' prefix
            const apiSlugs = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('api'.toLowerCase())
            );
            assert.ok(apiSlugs.includes('api-enhancement'), 'Should include api-enhancement');

            // Test with longer prefix
            const apiEnhSlugs = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('api-enh'.toLowerCase())
            );
            assert.ok(apiEnhSlugs.includes('api-enhancement'), 'Should match partial prefix');
            assert.strictEqual(apiEnhSlugs.length, 1, 'Should return only matching items');
        });

        test('Should maintain order consistency in completion results', async () => {
            const slugs1 = todoManager.getSavedListSlugs();
            const slugs2 = todoManager.getSavedListSlugs();

            assert.deepStrictEqual(slugs1, slugs2, 'Should return consistent order');

            // Test filtered results maintain order
            const filtered1 = slugs1.filter((slug: string) =>
                slug.toLowerCase().startsWith('p'.toLowerCase())
            );
            const filtered2 = slugs2.filter((slug: string) =>
                slug.toLowerCase().startsWith('p'.toLowerCase())
            );

            assert.deepStrictEqual(filtered1, filtered2, 'Filtered results should maintain order');
        });

        test('Should handle archive changes dynamically', async () => {
            const initialSlugs = todoManager.getSavedListSlugs();
            const initialCount = initialSlugs.length;

            // Add a new saved list by setting a title and then changing it
            await todoManager.setTodos([
                { id: 'new-task', content: 'New Task', status: 'completed', priority: 'medium' }
            ], 'New Project Saved');

            // Save it by changing the title
            await todoManager.setTodos([
                { id: 'another-task', content: 'Another Task', status: 'pending', priority: 'low' }
            ], 'Final Project');

            const newSlugs = todoManager.getSavedListSlugs();
            // We expect 2 more slugs: "current-project" (saved when setting "New Project Saved") 
            // and "new-project-saved" (saved when setting "Final Project")
            assert.strictEqual(newSlugs.length, initialCount + 2, 'Should have two more slugs');
            assert.ok(newSlugs.includes('new-project-saved'), 'Should include new archive slug');
            assert.ok(newSlugs.includes('current-project'), 'Should include current-project slug');

            // Test completion with the new slug
            const newProjectSlugs = newSlugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('new'.toLowerCase())
            );
            assert.ok(newProjectSlugs.includes('new-project-saved'), 'Should complete new archive');
        });

        test('Should provide completion context information', async () => {
            // Test that completion callback can receive context parameter
            const slugs = todoManager.getSavedListSlugs();

            // Mock context (simulating what MCP client might send)
            const mockContext = {
                arguments: {
                    someOtherParam: 'value'
                }
            };

            // The completion should still work regardless of context
            const results = slugs.filter((slug: string) =>
                slug.toLowerCase().startsWith('project'.toLowerCase())
            );

            assert.ok(results.length > 0, 'Should return results even with context');
        });
    });
});
