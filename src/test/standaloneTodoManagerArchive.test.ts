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

        // Create multiple archives with similar titles
        await manager.updateTodos(todos, 'Feature Request');
        await manager.updateTodos(todos, 'Feature Request');
        await manager.updateTodos(todos, 'Feature Request');

        const savedLists = manager.getSavedLists();
        assert.strictEqual(savedLists.length, 2); // Two archives

        const slugs = savedLists.map(archive => archive.slug);
        const uniqueSlugs = new Set(slugs);
        assert.strictEqual(slugs.length, uniqueSlugs.size, 'All slugs should be unique');

        // Check that slugs follow expected pattern
        assert.ok(slugs.some(slug => slug === 'feature-request'));
        assert.ok(slugs.some(slug => slug === 'feature-request-1'));
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
});