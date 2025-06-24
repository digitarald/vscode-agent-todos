import * as assert from 'assert';
import { TodoSync } from '../mcp/todoSync';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { TodoItem } from '../types';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('MCP Todo Sync Test Suite', () => {
    let todoManager: TodoManager;
    let standaloneTodoManager: StandaloneTodoManager;
    let todoSync: TodoSync;
    let context: any;

    setup(async function() {
        this.timeout(5000);
        
        // Mock context with workspaceState for TodoManager
        const workspaceState = new Map<string, any>();
        context = {
            subscriptions: [],
            workspaceState: {
                get: (key: string) => workspaceState.get(key),
                update: async (key: string, value: any) => {
                    workspaceState.set(key, value);
                }
            }
        };
        
        // Create instances with proper initialization
        todoManager = TodoManager.getInstance();
        todoManager.initialize(context); // Initialize with context
        
        const storage = new InMemoryStorage();
        standaloneTodoManager = new StandaloneTodoManager(storage); // Create new instance for isolation
        
        // Clear any existing todos
        await todoManager.setTodos([]);
        await standaloneTodoManager.updateTodos([]);
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create sync after clearing to ensure proper initialization
        todoSync = new TodoSync(todoManager, standaloneTodoManager);
        
        // Wait for sync to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    teardown(async () => {
        todoSync?.dispose();
        await todoManager?.clearTodos();
    });

    test('Empty to non-empty transition via MCP', async () => {
        // Verify initial empty state
        assert.strictEqual(todoManager.getTodos().length, 0);
        assert.strictEqual(standaloneTodoManager.getTodos().length, 0);

        // Create a change listener to track VS Code updates
        let vscodeChangeDetected = false;
        const disposable = todoManager.onDidChange(() => {
            vscodeChangeDetected = true;
        });

        // Add todos via MCP (standalone manager)
        const newTodos: TodoItem[] = [
            { id: '1', content: 'Test todo', status: 'pending', priority: 'medium' }
        ];
        await standaloneTodoManager.updateTodos(newTodos, 'Test Title');

        // Wait for sync to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify VS Code manager received the update
        assert.strictEqual(vscodeChangeDetected, true, 'VS Code change event should fire');
        assert.strictEqual(todoManager.getTodos().length, 1);
        assert.strictEqual(todoManager.getTodos()[0].content, 'Test todo');

        disposable.dispose();
    });

    test('Non-empty to empty transition via MCP', async () => {
        // Set initial todos
        const initialTodos: TodoItem[] = [
            { id: '1', content: 'Todo 1', status: 'pending', priority: 'high' },
            { id: '2', content: 'Todo 2', status: 'in_progress', priority: 'medium' }
        ];
        await todoManager.setTodos(initialTodos);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify sync to standalone
        assert.strictEqual(standaloneTodoManager.getTodos().length, 2);

        // Create a change listener
        let vscodeChangeDetected = false;
        const disposable = todoManager.onDidChange(() => {
            vscodeChangeDetected = true;
        });

        // Clear todos via MCP
        await standaloneTodoManager.updateTodos([], 'Empty List');

        // Wait for sync
        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify empty state synced to VS Code
        assert.strictEqual(vscodeChangeDetected, true, 'VS Code change event should fire for empty transition');
        assert.strictEqual(todoManager.getTodos().length, 0);

        disposable.dispose();
    });

    test('Rapid updates via MCP', async () => {
        let changeCount = 0;
        const disposable = todoManager.onDidChange(() => {
            changeCount++;
        });

        // Perform rapid updates
        for (let i = 1; i <= 5; i++) {
            const todos: TodoItem[] = [];
            for (let j = 1; j <= i; j++) {
                todos.push({
                    id: `${j}`,
                    content: `Todo ${j}`,
                    status: 'pending',
                    priority: 'medium'
                });
            }
            await standaloneTodoManager.updateTodos(todos);
            // Small delay between updates
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Wait for all syncs to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify final state
        assert.strictEqual(todoManager.getTodos().length, 5);
        assert.ok(changeCount >= 1, 'At least one change event should fire');
        console.log(`Rapid updates: ${changeCount} change events fired`);

        disposable.dispose();
    });

    test('Concurrent updates from both sides', async () => {
        // Update from VS Code side
        const vscodeTodos: TodoItem[] = [
            { id: '1', content: 'VS Code todo', status: 'pending', priority: 'high' }
        ];
        
        // Update from MCP side
        const mcpTodos: TodoItem[] = [
            { id: '2', content: 'MCP todo', status: 'in_progress', priority: 'medium' }
        ];

        // Perform concurrent updates
        const vscodeUpdate = todoManager.setTodos(vscodeTodos);
        const mcpUpdate = standaloneTodoManager.updateTodos(mcpTodos);

        await Promise.all([vscodeUpdate, mcpUpdate]);

        // Wait for syncs to settle
        await new Promise(resolve => setTimeout(resolve, 500));

        // The last update should win - verify consistency
        const vsTodos = todoManager.getTodos();
        const mcpTodosList = standaloneTodoManager.getTodos();
        
        assert.strictEqual(vsTodos.length, mcpTodosList.length, 'Both managers should have same todo count');
        assert.deepStrictEqual(vsTodos, mcpTodosList, 'Both managers should have identical todos');
    });

    test('Empty transition with title change', async () => {
        // Set initial todos with title
        await todoManager.setTodos([
            { id: '1', content: 'Initial todo', status: 'pending', priority: 'low' }
        ], 'Original Title');

        await new Promise(resolve => setTimeout(resolve, 300));

        // Clear todos and change title via MCP
        await standaloneTodoManager.updateTodos([], 'New Empty Title');

        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify both empty state and title synced
        assert.strictEqual(todoManager.getTodos().length, 0);
        assert.strictEqual(todoManager.getTitle().includes('New Empty Title'), true);
    });

    test('Subtask updates via MCP', async () => {
        const todoWithSubtasks: TodoItem = {
            id: '1',
            content: 'Main task',
            status: 'in_progress',
            priority: 'high',
            subtasks: [
                { id: 's1', content: 'Subtask 1', status: 'completed' },
                { id: 's2', content: 'Subtask 2', status: 'pending' }
            ]
        };

        // Update via MCP
        await standaloneTodoManager.updateTodos([todoWithSubtasks]);

        await new Promise(resolve => setTimeout(resolve, 300));

        // Verify subtasks synced correctly
        const syncedTodos = todoManager.getTodos();
        assert.strictEqual(syncedTodos.length, 1);
        assert.strictEqual(syncedTodos[0].subtasks?.length, 2);
        assert.strictEqual(syncedTodos[0].subtasks?.[0].status, 'completed');
    });
});