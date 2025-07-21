import * as assert from 'assert';
import { SavedTodoList, TodoItem } from '../types';
import { areListsExactMatch } from '../utils/listComparison';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('Deduplication Tests', () => {
    const createTodoItem = (id: string, content: string, status: 'pending' | 'in_progress' | 'completed' = 'pending', priority: 'low' | 'medium' | 'high' = 'medium', adr?: string): TodoItem => ({
        id,
        content,
        status,
        priority,
        adr
    });

    const createSavedList = (title: string, todos: TodoItem[], slug: string = 'test-slug'): SavedTodoList => ({
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        title,
        todos,
        savedAt: new Date('2025-07-20T10:00:00Z'),
        slug
    });

    suite('areListsExactMatch', () => {
        test('should return true for identical lists', () => {
            const todos = [
                createTodoItem('task-1', 'First task', 'pending', 'high'),
                createTodoItem('task-2', 'Second task', 'completed', 'medium', 'Some decision')
            ];

            const list1 = createSavedList('Test Project', todos, 'test-project');
            const list2 = createSavedList('Test Project', todos, 'test-project-2'); // Different slug should not matter

            assert.strictEqual(areListsExactMatch(list1, list2), true);
        });

        test('should return false for different titles', () => {
            const todos = [createTodoItem('task-1', 'First task')];
            
            const list1 = createSavedList('Project A', todos);
            const list2 = createSavedList('Project B', todos);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo counts', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task'),
                createTodoItem('task-2', 'Second task')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo IDs', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-2', 'First task')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo content', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'Different task')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo status', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'completed')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo priority', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'high')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'low')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should return false for different todo ADR', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', 'Decision A')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', 'Decision B')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should handle undefined ADR correctly', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', undefined)
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', undefined)
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), true);
        });

        test('should return false when one ADR is undefined and other is not', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', undefined)
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task', 'pending', 'medium', 'Some decision')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should handle empty todo lists', () => {
            const list1 = createSavedList('Empty Project', []);
            const list2 = createSavedList('Empty Project', []);

            assert.strictEqual(areListsExactMatch(list1, list2), true);
        });

        test('should return false for different todo order', () => {
            const list1 = createSavedList('Test Project', [
                createTodoItem('task-1', 'First task'),
                createTodoItem('task-2', 'Second task')
            ]);
            const list2 = createSavedList('Test Project', [
                createTodoItem('task-2', 'Second task'),
                createTodoItem('task-1', 'First task')
            ]);

            assert.strictEqual(areListsExactMatch(list1, list2), false);
        });

        test('should handle complex lists with multiple todos', () => {
            const todos = [
                createTodoItem('task-1', 'Implement authentication', 'in_progress', 'high', 'Using JWT tokens'),
                createTodoItem('task-2', 'Setup database', 'completed', 'medium'),
                createTodoItem('task-3', 'Write tests', 'pending', 'low', 'Focus on unit tests first')
            ];

            const list1 = createSavedList('User Management Project', todos);
            const list2 = createSavedList('User Management Project', [...todos]); // Copy array

            assert.strictEqual(areListsExactMatch(list1, list2), true);
        });

        test('should ignore savedAt and id differences', () => {
            const todos = [createTodoItem('task-1', 'Test task')];
            
            const list1: SavedTodoList = {
                id: 'different-id-1',
                title: 'Test Project',
                todos,
                savedAt: new Date('2025-07-20T10:00:00Z'),
                slug: 'test-project-1'
            };

            const list2: SavedTodoList = {
                id: 'different-id-2',
                title: 'Test Project',
                todos,
                savedAt: new Date('2025-07-20T11:00:00Z'),
                slug: 'test-project-2'
            };

            assert.strictEqual(areListsExactMatch(list1, list2), true);
        });
    });

    suite('StandaloneTodoManager Deduplication', () => {
        let manager: StandaloneTodoManager;

        setup(() => {
            const storage = new InMemoryStorage();
            manager = new StandaloneTodoManager(storage);
        });

        teardown(() => {
            manager.dispose();
        });

        test('should prevent exact duplicate saves', async () => {
            const todos = [
                createTodoItem('task-1', 'Test task', 'pending', 'medium')
            ];

            // Save initial list
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'New Project'); // This should save 'Test Project'

            // Attempt to save identical list again
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'Another Project'); // This should be prevented

            const savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should have only one saved list - duplicate should be prevented');
            assert.strictEqual(savedLists[0].title, 'Test Project');
        });

        test('should allow saves when todo status differs', async () => {
            const todosV1 = [
                createTodoItem('task-1', 'Test task', 'pending', 'medium')
            ];
            const todosV2 = [
                createTodoItem('task-1', 'Test task', 'completed', 'medium')
            ];

            // Save initial list with pending task
            await manager.updateTodos(todosV1, 'Test Project');
            await manager.updateTodos([], 'New Project'); // This should save 'Test Project'

            // Save list with completed task - should be allowed
            await manager.updateTodos(todosV2, 'Test Project');
            await manager.updateTodos([], 'Final Project'); // This should save second version

            const savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 2, 'Should have two saved lists - different status should be allowed');
            
            // Verify both versions exist
            const pendingVersion = savedLists.find(list => list.todos[0].status === 'pending');
            const completedVersion = savedLists.find(list => list.todos[0].status === 'completed');
            assert.ok(pendingVersion, 'Should have pending version');
            assert.ok(completedVersion, 'Should have completed version');
        });

        test('should allow saves when todo content differs', async () => {
            const todosV1 = [
                createTodoItem('task-1', 'Original task', 'pending', 'medium')
            ];
            const todosV2 = [
                createTodoItem('task-1', 'Modified task', 'pending', 'medium')
            ];

            // Save initial list
            await manager.updateTodos(todosV1, 'Test Project');
            await manager.updateTodos([], 'New Project');

            // Save list with different content - should be allowed
            await manager.updateTodos(todosV2, 'Test Project');
            await manager.updateTodos([], 'Final Project');

            const savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 2, 'Should have two saved lists - different content should be allowed');
        });

        test('should prevent duplicate when multiple todos are identical', async () => {
            const todos = [
                createTodoItem('task-1', 'First task', 'pending', 'high'),
                createTodoItem('task-2', 'Second task', 'completed', 'medium', 'Some decision'),
                createTodoItem('task-3', 'Third task', 'in_progress', 'low')
            ];

            // Save initial list
            await manager.updateTodos(todos, 'Complex Project');
            await manager.updateTodos([], 'New Project');

            // Attempt to save identical complex list
            await manager.updateTodos([...todos], 'Complex Project'); // Copy array
            await manager.updateTodos([], 'Another Project');

            const savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should prevent duplicate of complex list');
        });

        test('should prevent duplicate even with different slug generation', async () => {
            const todos = [createTodoItem('task-1', 'Test task')];

            // Save initial list
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'New Project'); // Creates 'test-project' slug

            // Manually add a list with different slug to test slug collision handling
            const existingLists = manager.getSavedLists();
            assert.strictEqual(existingLists.length, 1);

            // Try to save identical content again - should be prevented regardless of slug
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'Final Project');

            const finalLists = manager.getSavedLists();
            assert.strictEqual(finalLists.length, 1, 'Should still have only one list despite potential slug differences');
        });
    });
});
