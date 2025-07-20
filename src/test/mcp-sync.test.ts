import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { TodoSync } from '../mcp/todoSync';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoItem } from '../types';
import { getMockExtensionContext } from './testUtils';

suite('Todo Sync', () => {
    let todoManager: TodoManager;
    let standaloneTodoManager: StandaloneTodoManager;
    let todoSync: TodoSync;
    let context: vscode.ExtensionContext;

    setup(async function() {
        this.timeout(5000);
        
        context = getMockExtensionContext();
        
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