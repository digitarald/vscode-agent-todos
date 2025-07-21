import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { WorkspaceStateStorage } from '../storage/WorkspaceStateStorage';
import { TodoItem } from '../types';

suite('Saved Todos Storage Test Suite', () => {
    let todoManager: TodoManager;
    let mockContext: any;

    setup(async () => {
        // Create mock context for WorkspaceStateStorage
        mockContext = {
            workspaceState: {
                data: new Map(),
                get: function(key: string) {
                    return this.data.get(key);
                },
                update: function(key: string, value: any) {
                    this.data.set(key, value);
                    return Promise.resolve();
                }
            }
        };

        // Clear singleton before each test
        (TodoManager as any).instance = undefined;

        // Initialize TodoManager with mock context
        todoManager = TodoManager.getInstance();
        await todoManager.initialize(mockContext);
    });

    teardown(async () => {
        if (todoManager) {
            todoManager.dispose();
        }
        (TodoManager as any).instance = undefined;
    });

    test('should persist saved lists to storage when title changes', async () => {
        // Setup initial todo list
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Initial Project');
        
        // Change title - should archive the current list and persist to storage
        await todoManager.setTodos([], 'New Project');

        // Check that the previous list was saved
        const savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);
        assert.strictEqual(savedLists[0].title, 'Initial Project');
        assert.strictEqual(savedLists[0].todos.length, 1);

        // Verify it was persisted to storage by checking the mock storage
        const storageData = mockContext.workspaceState.get('agentTodos.savedLists');
        assert.ok(storageData);
        assert.strictEqual(storageData.length, 1);
        assert.strictEqual(storageData[0].title, 'Initial Project');
    });

    test('should clear saved lists and persist to storage', async () => {
        // First create some saved lists
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Project A');
        await todoManager.setTodos([], 'Project B');

        // Verify we have saved lists
        let savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);

        // Clear saved lists
        await todoManager.clearSavedLists();

        // Verify they're cleared in memory
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0);

        // Verify they're cleared in storage
        const storageData = mockContext.workspaceState.get('agentTodos.savedLists');
        assert.deepStrictEqual(storageData, []);
    });

    test('should delete individual saved list and persist to storage', async () => {
        // Create multiple saved lists
        const todos1: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo 1',
            status: 'pending',
            priority: 'medium'
        }];

        const todos2: TodoItem[] = [{
            id: 'test-2',
            content: 'Test todo 2',
            status: 'pending',
            priority: 'high'
        }];

        await todoManager.setTodos(todos1, 'Project A');
        await todoManager.setTodos(todos2, 'Project B');
        await todoManager.setTodos([], 'Project C');

        // Should have 2 saved lists
        let savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 2);

        // Delete one by slug
        const slugToDelete = savedLists[0].slug;
        const deleted = await todoManager.deleteSavedList(slugToDelete);
        assert.strictEqual(deleted, true);

        // Verify deletion in memory
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);

        // Verify deletion persisted to storage
        const storageData = mockContext.workspaceState.get('agentTodos.savedLists');
        assert.strictEqual(storageData.length, 1);
        assert.notStrictEqual(storageData[0].slug, slugToDelete);
    });

    test('should load saved lists from storage on initialization', async () => {
        // Simulate existing data in storage
        const existingSavedLists = [{
            id: 'saved-1',
            title: 'Existing Project',
            todos: [{
                id: 'todo-1',
                content: 'Existing todo',
                status: 'completed',
                priority: 'low'
            }],
            savedAt: new Date('2023-01-01'),
            slug: 'existing-project'
        }];

        // Set data in the mock storage using the proper storage key
        await mockContext.workspaceState.update('agentTodos.savedLists', existingSavedLists);

        // Clear the singleton instance to force fresh initialization
        if (todoManager) {
            todoManager.dispose();
        }
        (TodoManager as any).instance = undefined;
        
        // Create a fresh TodoManager instance
        const freshTodoManager = TodoManager.getInstance();
        await freshTodoManager.initialize(mockContext);

        // Should load the existing saved lists
        const savedLists = freshTodoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);
        assert.strictEqual(savedLists[0].title, 'Existing Project');
        assert.strictEqual(savedLists[0].slug, 'existing-project');

        // Cleanup
        freshTodoManager.dispose();
        (TodoManager as any).instance = undefined;
        
        // Restore the original todoManager for other tests
        todoManager = TodoManager.getInstance();
        await todoManager.initialize(mockContext);
    });
});
