import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoItem } from '../types';

suite('TodoManager Archive Test Suite', () => {
    let todoManager: TodoManager;

    setup(() => {
        // Initialize TodoManager with mock storage
        todoManager = (TodoManager as any).getInstance();
        // Reset the instance by creating a new one for testing
        (TodoManager as any).instance = undefined;
        todoManager = (TodoManager as any).getInstance();
        
        // Initialize with mock context
        const mockContext = {
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve()
            }
        };
        todoManager.initialize(mockContext as any);
    });

    teardown(() => {
        todoManager.dispose();
        (TodoManager as any).instance = undefined;
    });

    test('should archive current list when title changes', async () => {
        // Setup initial todo list
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Project Alpha');

        // Change title - should archive the current list
        await todoManager.setTodos([], 'Project Beta');

        // Check that the previous list was archived
        const archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 1);
        assert.strictEqual(archivedLists[0].title, 'Project Alpha');
        assert.strictEqual(archivedLists[0].todos.length, 1);
        assert.strictEqual(archivedLists[0].todos[0].content, 'Test todo');
    });

    test('should not archive default title or empty lists', async () => {
        // Test with default title
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Todos');
        await todoManager.setTodos([], 'New Project');

        // Should not archive default title
        let archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 0);

        // Test with empty list
        await todoManager.setTodos([], 'Empty Project');
        await todoManager.setTodos(todos, 'Another Project');

        // Should not archive empty list
        archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 0);
    });

    test('should generate unique slugs for archives', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        // Create multiple archives with similar titles
        await todoManager.setTodos(todos, 'Project Alpha');
        await todoManager.setTodos(todos, 'Project Alpha');
        await todoManager.setTodos(todos, 'Project Alpha');

        const archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 2); // Two archives (third overwrites current)

        const slugs = archivedLists.map(archive => archive.slug);
        const uniqueSlugs = new Set(slugs);
        assert.strictEqual(slugs.length, uniqueSlugs.size, 'All slugs should be unique');
    });

    test('should retrieve archived list by slug', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Archived todo',
            status: 'completed',
            priority: 'high'
        }];

        await todoManager.setTodos(todos, 'Completed Project');
        await todoManager.setTodos([], 'New Project');

        const archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 1);

        const slug = archivedLists[0].slug;
        const retrieved = todoManager.getArchivedListBySlug(slug);

        assert.ok(retrieved);
        assert.strictEqual(retrieved.title, 'Completed Project');
        assert.strictEqual(retrieved.todos[0].content, 'Archived todo');
        assert.strictEqual(retrieved.todos[0].status, 'completed');
    });

    test('should return undefined for non-existent slug', () => {
        const retrieved = todoManager.getArchivedListBySlug('non-existent-slug');
        assert.strictEqual(retrieved, undefined);
    });

    test('should return archived lists sorted by date (newest first)', async () => {
        const todos1: TodoItem[] = [{
            id: 'test-1',
            content: 'First todo',
            status: 'pending',
            priority: 'medium'
        }];

        const todos2: TodoItem[] = [{
            id: 'test-2',
            content: 'Second todo',
            status: 'pending',
            priority: 'medium'
        }];

        // Create archives with delays to ensure different timestamps
        await todoManager.setTodos(todos1, 'First Project');
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
        await todoManager.setTodos(todos2, 'Second Project');
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
        await todoManager.setTodos([], 'Final Project');

        const archivedLists = todoManager.getArchivedLists();
        assert.strictEqual(archivedLists.length, 2);

        // Should be sorted by date, newest first
        assert.strictEqual(archivedLists[0].title, 'Second Project');
        assert.strictEqual(archivedLists[1].title, 'First Project');
        assert.ok(archivedLists[0].archivedAt >= archivedLists[1].archivedAt);
    });

    test('should get list of all archive slugs', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Alpha Project');
        await todoManager.setTodos(todos, 'Beta Project');
        await todoManager.setTodos([], 'Final Project');

        const slugs = todoManager.getArchivedListSlugs();
        assert.strictEqual(slugs.length, 2);
        assert.ok(slugs.includes('alpha-project'));
        assert.ok(slugs.includes('beta-project'));
    });
});