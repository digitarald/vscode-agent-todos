import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServerProvider } from '../../mcp/mcpProvider';
import { TodoManager } from '../../todoManager';
import { TodoTreeDataProvider } from '../../todoTreeProvider';

suite('MCP Empty State Transition Tests', () => {
    let provider: TodoMCPServerProvider;
    let todoManager: TodoManager;
    let treeProvider: TodoTreeDataProvider;
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
        
        // Initialize components
        todoManager = TodoManager.getInstance();
        todoManager.initialize(context); // Initialize with context to avoid storage warnings
        await todoManager.clearTodos();
        
        treeProvider = new TodoTreeDataProvider();
        
        // Start MCP provider
        provider = new TodoMCPServerProvider(context);
        await provider.ensureServerStarted();
        
        // Give everything time to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    teardown(async () => {
        await provider?.dispose();
        await todoManager?.clearTodos();
    });

    test('Should update tree view when going from empty to non-empty via MCP', async function() {
        this.timeout(10000); // Increase timeout for this test
        
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Wait a bit more for sync to be fully established
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify starting with empty state
        let todos = todoManager.getTodos();
        assert.strictEqual(todos.length, 0, 'Should start with no todos');
        
        // Check tree shows empty state
        let children = await treeProvider.getChildren();
        assert.strictEqual(children.length, 1, 'Should show one item (empty state)');
        assert.strictEqual(children[0].label, 'No todos yet');
        
        // Track if tree refresh was triggered
        let refreshTriggered = false;
        const disposable = treeProvider.onDidChangeTreeData(() => {
            refreshTriggered = true;
        });
        
        try {
            // Add todos via MCP
            const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                todos: [
                    {
                        id: 'empty-test-1',
                        content: 'First todo after empty',
                        status: 'pending',
                        priority: 'high'
                    }
                ],
                title: 'Empty State Test'
            });
            
            assert.ok(!writeResult.isError, 'Write should succeed');
            
            console.log('[TEST] Write result:', JSON.stringify(writeResult));
            
            // Give time for sync and events to propagate
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Verify todos were added
            todos = todoManager.getTodos();
            console.log('[TEST] TodoManager todos after sync:', todos.length, JSON.stringify(todos));
            assert.strictEqual(todos.length, 1, 'Should have one todo');
            assert.strictEqual(todos[0].content, 'First todo after empty');
            
            // Verify tree refresh was triggered
            assert.ok(refreshTriggered, 'Tree refresh should have been triggered');
            
            // Check tree no longer shows empty state
            children = await treeProvider.getChildren();
            assert.ok(children.length > 0, 'Should have at least one item');
            assert.ok(children[0].label !== 'No todos yet', 'Should not show empty state');
        } finally {
            disposable.dispose();
        }
    });

    test('Should update tree view when going from non-empty to empty via MCP', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Start with some todos
        await server.getTodoTools().handleToolCall('todo_write', {
            todos: [
                {
                    id: 'clear-test-1',
                    content: 'Todo to be cleared',
                    status: 'pending',
                    priority: 'low'
                }
            ]
        });
        
        // Give time for initial sync
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify we have todos
        let todos = todoManager.getTodos();
        assert.strictEqual(todos.length, 1, 'Should have one todo');
        
        // Track if tree refresh was triggered
        let refreshTriggered = false;
        const disposable = treeProvider.onDidChangeTreeData(() => {
            refreshTriggered = true;
        });
        
        try {
            // Clear todos via MCP
            const writeResult = await server.getTodoTools().handleToolCall('todo_write', {
                todos: []
            });
            
            assert.ok(!writeResult.isError, 'Clear should succeed');
            
            // Give time for sync and events to propagate
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify todos were cleared
            todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 0, 'Should have no todos');
            
            // Verify tree refresh was triggered
            assert.ok(refreshTriggered, 'Tree refresh should have been triggered');
            
            // Check tree shows empty state
            const children = await treeProvider.getChildren();
            assert.strictEqual(children.length, 1, 'Should show one item');
            assert.strictEqual(children[0].label, 'No todos yet', 'Should show empty state');
        } finally {
            disposable.dispose();
        }
    });

    test('Should handle rapid empty/non-empty transitions', async () => {
        const server = provider.getServer();
        assert.ok(server);
        await server.initialize();
        
        // Track refresh count
        let refreshCount = 0;
        const disposable = treeProvider.onDidChangeTreeData(() => {
            refreshCount++;
        });
        
        try {
            // Perform rapid transitions
            for (let i = 0; i < 3; i++) {
                // Add todos
                await server.getTodoTools().handleToolCall('todo_write', {
                    todos: [{
                        id: `rapid-${i}`,
                        content: `Rapid test ${i}`,
                        status: 'pending',
                        priority: 'medium'
                    }]
                });
                
                // Small delay to ensure the add is processed
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Clear immediately
                await server.getTodoTools().handleToolCall('todo_write', {
                    todos: []
                });
                
                // Small delay to ensure the clear is processed
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Give time for all events to settle
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Should end up empty
            const todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 0, 'Should end with no todos');
            
            // Should have triggered multiple refreshes
            assert.ok(refreshCount >= 3, `Should have triggered at least 3 refreshes, got ${refreshCount}`);
            
            // Tree should show empty state
            const children = await treeProvider.getChildren();
            assert.strictEqual(children.length, 1, 'Should show one item');
            assert.strictEqual(children[0].label, 'No todos yet', 'Should show empty state');
        } finally {
            disposable.dispose();
        }
    });
});