import * as assert from 'assert';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoItem } from '../types';

suite('StandaloneTodoManager Saved Lists Test Suite', () => {
    let manager: StandaloneTodoManager;

    setup(() => {
        const storage = new InMemoryStorage();
        manager = new StandaloneTodoManager(storage);
    });

    teardown(() => {
        manager.dispose();
    });

    test('should archive current list when title changes', async () => {
        // Setup initial todo list
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await manager.updateTodos(todos, 'Project Alpha');

        // Change title - should archive the current list
        await manager.updateTodos([], 'Project Beta');

        // Check that the previous list was saved
        const savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);
        assert.strictEqual(savedLists[0].title, 'Project Alpha');
        assert.strictEqual(savedLists[0].todos.length, 1);
        assert.strictEqual(savedLists[0].todos[0].content, 'Test todo');
    });

    test('should not archive default title or empty lists', async () => {
        // Test with default title
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await manager.updateTodos(todos, 'Todos');
        await manager.updateTodos([], 'New Project');

        // Should not archive default title
        let savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0);

        // Test with empty list
        await manager.updateTodos([], 'Empty Project');
        await manager.updateTodos(todos, 'Another Project');

        // Should not archive empty list
        savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0);
    });

    test('should emit archive change events', (done) => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        // Listen for archive change event
        const disposable = manager.onSavedListChange(() => {
            disposable.dispose();
            done();
        });

        // Trigger archive by changing title
        manager.updateTodos(todos, 'Initial Project').then(() => {
            return manager.updateTodos([], 'New Project');
        });
    });

    test('should retrieve saved list by slug', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Saved todo',
            status: 'completed',
            priority: 'high'
        }];

        await manager.updateTodos(todos, 'Completed Project');
        await manager.updateTodos([], 'New Project');

        const savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);

        const slug = savedLists[0].slug;
        const retrieved = manager.getSavedListBySlug(slug);

        assert.ok(retrieved);
        assert.strictEqual(retrieved.title, 'Completed Project');
        assert.strictEqual(retrieved.todos[0].content, 'Saved todo');
        assert.strictEqual(retrieved.todos[0].status, 'completed');
    });

    test('should generate unique slugs for similar titles', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        // Create multiple archives by changing titles (proper way to create archives)
        await manager.updateTodos(todos, 'Feature Request');
        await manager.updateTodos(todos, 'Feature Request V2'); // Different title - creates archive
        await manager.updateTodos(todos, 'Feature Request');   // Back to same title as first - creates archive

        const savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 2); // Two archives from title changes

        const slugs = savedLists.map(archive => archive.slug);
        const uniqueSlugs = new Set(slugs);
        assert.strictEqual(slugs.length, uniqueSlugs.size, 'All slugs should be unique');

        // Check that slugs follow expected pattern
        assert.ok(slugs.some(slug => slug === 'feature-request-v2'), 'Should have slug for Feature Request V2');
        assert.ok(slugs.some(slug => slug.startsWith('feature-request')), 'Should have slug for Feature Request');
    });

    test('setTodos should work as alias for updateTodos', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await manager.setTodos(todos, 'Project Using SetTodos');
        await manager.setTodos([], 'New Project');

        const savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);
        assert.strictEqual(savedLists[0].title, 'Project Using SetTodos');
    });

    test('should NOT create duplicate archives when updating todo statuses within same project', async () => {
        // Setup initial todo list with custom title
        const todos: TodoItem[] = [
            {
                id: 'task-1',
                content: 'First task',
                status: 'pending',
                priority: 'medium'
            },
            {
                id: 'task-2', 
                content: 'Second task',
                status: 'pending',
                priority: 'medium'
            }
        ];

        await manager.updateTodos(todos, 'My Project');

        // Verify no archives yet
        let savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives initially');

        // Update first task status to in_progress (same title)
        const updatedTodos1 = [
            { ...todos[0], status: 'in_progress' as const },
            todos[1]
        ];
        await manager.updateTodos(updatedTodos1, 'My Project');

        // Should still have no archives (same title)
        savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after status update');

        // Complete first task (same title)
        const updatedTodos2 = [
            { ...todos[0], status: 'completed' as const },
            todos[1]
        ];
        await manager.updateTodos(updatedTodos2, 'My Project');

        // Should still have no archives (same title)
        savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after completion');

        // Complete second task (same title)
        const updatedTodos3 = [
            { ...todos[0], status: 'completed' as const },
            { ...todos[1], status: 'completed' as const }
        ];
        await manager.updateTodos(updatedTodos3, 'My Project');

        // Should still have no archives (same title)
        savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after all completions');

        // NOW change title - this should create exactly ONE archive
        await manager.updateTodos([], 'New Project');

        // Should now have exactly one archive
        savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 1, 'Should have exactly one archive after title change');
        assert.strictEqual(savedLists[0].title, 'My Project', 'Archive should have original title');
        assert.strictEqual(savedLists[0].todos.length, 2, 'Archive should have final todos');
        assert.strictEqual(savedLists[0].todos[0].status, 'completed', 'Archive should have final status');
    });
});