import * as assert from 'assert';
import { TodoTools } from '../../mcp/tools/todoTools';
import { TodoManager } from '../../todoManager';
import { StandaloneTodoManager } from '../../mcp/standaloneTodoManager';
import { TodoMCPServer } from '../../mcp/server';
import { TodoSync } from '../../mcp/todoSync';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import * as vscode from 'vscode';

suite('MCP Todo Sync Data Loss Tests', () => {
    let todoTools: TodoTools;
    let vscodeManager: TodoManager;
    let standaloneManager: StandaloneTodoManager;
    let mockServer: TodoMCPServer;
    let todoSync: TodoSync;
    let context: vscode.ExtensionContext;

    setup(async () => {
        // Create mock context for VS Code manager
        const mockMemento = {
            get: () => undefined,
            update: async () => { }
        };
        context = {
            workspaceState: mockMemento,
            subscriptions: []
        } as any;

        // Initialize managers
        vscodeManager = TodoManager.getInstance();
        vscodeManager.initialize(context);
        
        const storage = new InMemoryStorage();
        standaloneManager = new StandaloneTodoManager(storage);
        
        // Setup server and sync
        mockServer = new TodoMCPServer({ standalone: false });
        todoSync = new TodoSync(vscodeManager, standaloneManager);
        
        mockServer.setTodoManager(standaloneManager);
        mockServer.setTodoSync(todoSync);
        await mockServer.initialize();
        
        todoTools = mockServer.getTodoTools();
        
        // Clear any existing todos
        await vscodeManager.clearTodos();
        await standaloneManager.clearTodos();
    });

    teardown(async () => {
        await vscodeManager.clearTodos();
        await standaloneManager.clearTodos();
        if (mockServer) {
            await mockServer.stop();
        }
    });

    test('Should preserve existing todos when writing new ones through MCP', async () => {
        // Step 1: Add initial todos directly to VS Code manager
        const initialTodos = [
            {
                id: '1',
                content: 'Existing todo 1',
                status: 'pending' as const,
                priority: 'high' as const
            },
            {
                id: '2',
                content: 'Existing todo 2',
                status: 'completed' as const,
                priority: 'medium' as const
            }
        ];
        
        await vscodeManager.setTodos(initialTodos, 'Initial List');
        
        // Wait for sync to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify todos are synced to standalone manager
        const syncedTodos = standaloneManager.getTodos();
        assert.strictEqual(syncedTodos.length, 2, 'Initial todos should be synced');
        
        // Step 2: Write new todos through MCP tool (including existing ones)
        const updatedTodos = [
            ...initialTodos,
            {
                id: '3',
                content: 'New todo 3',
                status: 'pending' as const,
                priority: 'low' as const
            }
        ];
        
        const result = await todoTools.handleToolCall('todo_write', {
            todos: updatedTodos,
            title: 'Updated List'
        });
        
        assert.strictEqual(result.isError, undefined, 'Write should succeed');
        
        // Wait for sync to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Step 3: Verify all todos are preserved
        const finalVSCodeTodos = vscodeManager.getTodos();
        const finalStandaloneTodos = standaloneManager.getTodos();
        
        assert.strictEqual(finalVSCodeTodos.length, 3, 'VS Code should have all 3 todos');
        assert.strictEqual(finalStandaloneTodos.length, 3, 'Standalone should have all 3 todos');
        
        // Verify todo contents
        assert.strictEqual(finalVSCodeTodos[0].content, 'Existing todo 1');
        assert.strictEqual(finalVSCodeTodos[1].content, 'Existing todo 2');
        assert.strictEqual(finalVSCodeTodos[2].content, 'New todo 3');
        
        // Verify title was updated
        assert.strictEqual(vscodeManager.getBaseTitle(), 'Updated List');
        assert.strictEqual(standaloneManager.getTitle(), 'Updated List');
    });

    test('Should handle rapid consecutive writes without data loss', async () => {
        // Step 1: Perform multiple rapid writes
        const writes = [
            { todos: [{ id: '1', content: 'First', status: 'pending' as const, priority: 'high' as const }], title: 'List 1' },
            { todos: [{ id: '1', content: 'First', status: 'pending' as const, priority: 'high' as const }, { id: '2', content: 'Second', status: 'pending' as const, priority: 'medium' as const }], title: 'List 2' },
            { todos: [{ id: '1', content: 'First', status: 'completed' as const, priority: 'high' as const }, { id: '2', content: 'Second', status: 'pending' as const, priority: 'medium' as const }, { id: '3', content: 'Third', status: 'pending' as const, priority: 'low' as const }], title: 'List 3' }
        ];
        
        for (const write of writes) {
            const result = await todoTools.handleToolCall('todo_write', write);
            assert.strictEqual(result.isError, undefined, 'Write should succeed');
            // Small delay between writes
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Wait for final sync
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify final state
        const finalVSCodeTodos = vscodeManager.getTodos();
        const finalStandaloneTodos = standaloneManager.getTodos();
        
        assert.strictEqual(finalVSCodeTodos.length, 3, 'Should have 3 todos after all writes');
        assert.strictEqual(finalStandaloneTodos.length, 3, 'Standalone should match');
        assert.strictEqual(vscodeManager.getBaseTitle(), 'List 3', 'Title should be from last write');
        
        // Verify first todo status was updated
        assert.strictEqual(finalVSCodeTodos[0].status, 'completed', 'First todo should be completed');
    });

    test('Should not lose todos when sync direction conflicts occur', async () => {
        // Step 1: Add todos to both managers simultaneously
        const vscodePromise = vscodeManager.setTodos([
            { id: 'v1', content: 'VS Code todo', status: 'pending' as const, priority: 'high' as const }
        ], 'VS Code List');
        
        const standalonePromise = standaloneManager.updateTodos([
            { id: 's1', content: 'Standalone todo', status: 'pending' as const, priority: 'medium' as const }
        ], 'Standalone List');
        
        await Promise.all([vscodePromise, standalonePromise]);
        
        // Wait for sync to settle
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Step 2: Write through MCP tool
        const result = await todoTools.handleToolCall('todo_write', {
            todos: [
                { id: 'mcp1', content: 'MCP todo', status: 'pending' as const, priority: 'low' as const }
            ],
            title: 'MCP List'
        });
        
        assert.strictEqual(result.isError, undefined, 'Write should succeed');
        
        // Wait for sync
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 3: Verify final state - should have MCP todos (last write wins)
        const finalVSCodeTodos = vscodeManager.getTodos();
        const finalStandaloneTodos = standaloneManager.getTodos();
        
        assert.strictEqual(finalVSCodeTodos.length, 1, 'Should have 1 todo from MCP');
        assert.strictEqual(finalStandaloneTodos.length, 1, 'Standalone should match');
        assert.strictEqual(finalVSCodeTodos[0].id, 'mcp1', 'Should be MCP todo');
        assert.strictEqual(vscodeManager.getBaseTitle(), 'MCP List', 'Title should be from MCP');
    });
});