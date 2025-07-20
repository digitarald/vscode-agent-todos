import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoItem } from '../types';

suite('TodoManager Saved Lists Test Suite', () => {
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

        // Check that the previous list was saved
        const savedLists = todoManager.getSavedLists();
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

        await todoManager.setTodos(todos, 'Todos');
        await todoManager.setTodos([], 'New Project');

        // Should not archive default title
        let savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0);

        // Test with empty list
        await todoManager.setTodos([], 'Empty Project');
        await todoManager.setTodos(todos, 'Another Project');

        // Should not archive empty list
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0);
    });

    test('should generate unique slugs for archives', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        // Create multiple archives by changing titles (proper way to create archives)
        await todoManager.setTodos(todos, 'Project Alpha');
        await todoManager.setTodos(todos, 'Project Alpha V2'); // Different title - creates archive
        await todoManager.setTodos(todos, 'Project Alpha');   // Back to same title as first - creates archive

        const savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 2); // Two archives from title changes

        const slugs = savedLists.map(archive => archive.slug);
        const uniqueSlugs = new Set(slugs);
        assert.strictEqual(slugs.length, uniqueSlugs.size, 'All slugs should be unique');
        
        // Should have slugs for both titles
        assert.ok(slugs.some(slug => slug === 'project-alpha-v2'), 'Should have slug for Project Alpha V2');
        assert.ok(slugs.some(slug => slug.startsWith('project-alpha')), 'Should have slug for Project Alpha');
    });

    test('should retrieve saved list by slug', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Saved todo',
            status: 'completed',
            priority: 'high'
        }];

        await todoManager.setTodos(todos, 'Completed Project');
        await todoManager.setTodos([], 'New Project');

        const savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1);

        const slug = savedLists[0].slug;
        const retrieved = todoManager.getSavedListBySlug(slug);

        assert.ok(retrieved);
        assert.strictEqual(retrieved.title, 'Completed Project');
        assert.strictEqual(retrieved.todos[0].content, 'Saved todo');
        assert.strictEqual(retrieved.todos[0].status, 'completed');
    });

    test('should return undefined for non-existent slug', () => {
        const retrieved = todoManager.getSavedListBySlug('non-existent-slug');
        assert.strictEqual(retrieved, undefined);
    });

    test('should return saved lists sorted by date (newest first)', async () => {
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

        const savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 2);

        // Should be sorted by date, newest first
        assert.strictEqual(savedLists[0].title, 'Second Project');
        assert.strictEqual(savedLists[1].title, 'First Project');
        assert.ok(savedLists[0].savedAt >= savedLists[1].savedAt);
    });

    test('should get list of all saved list slugs', async () => {
        const todos: TodoItem[] = [{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Alpha Project');
        await todoManager.setTodos(todos, 'Beta Project');
        await todoManager.setTodos([], 'Final Project');

        const slugs = todoManager.getSavedListSlugs();
        assert.strictEqual(slugs.length, 2);
        assert.ok(slugs.includes('alpha-project'));
        assert.ok(slugs.includes('beta-project'));
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

        await todoManager.setTodos(todos, 'My Project');

        // Verify no archives yet
        let savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives initially');

        // Update first task status to in_progress (same title)
        const updatedTodos1 = [
            { ...todos[0], status: 'in_progress' as const },
            todos[1]
        ];
        await todoManager.setTodos(updatedTodos1, 'My Project');

        // Should still have no archives (same title)
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after status update');

        // Complete first task (same title)
        const updatedTodos2 = [
            { ...todos[0], status: 'completed' as const },
            todos[1]
        ];
        await todoManager.setTodos(updatedTodos2, 'My Project');

        // Should still have no archives (same title)
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after completion');

        // Complete second task (same title)
        const updatedTodos3 = [
            { ...todos[0], status: 'completed' as const },
            { ...todos[1], status: 'completed' as const }
        ];
        await todoManager.setTodos(updatedTodos3, 'My Project');

        // Should still have no archives (same title)
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 0, 'Should have no archives after all completions');

        // NOW change title - this should create exactly ONE archive
        await todoManager.setTodos([], 'New Project');

        // Should now have exactly one archive
        savedLists = todoManager.getSavedLists();
        assert.strictEqual(savedLists.length, 1, 'Should have exactly one archive after title change');
        assert.strictEqual(savedLists[0].title, 'My Project', 'Archive should have original title');
        assert.strictEqual(savedLists[0].todos.length, 2, 'Archive should have final todos');
        assert.strictEqual(savedLists[0].todos[0].status, 'completed', 'Archive should have final status');
    });
});