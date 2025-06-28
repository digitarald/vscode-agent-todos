import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { TodoItem } from '../types';

suite('TodoManager Title Tests', () => {
    let todoManager: TodoManager;

    setup(async () => {
        todoManager = TodoManager.getInstance();
        todoManager.initialize();
        await todoManager.clearTodos();
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    test('Should return empty string when no todos exist with default title', async () => {
        await todoManager.clearTodos(); // This sets title to 'Todos'
        
        const title = todoManager.getTitle();
        assert.strictEqual(title, '', 'Title should be empty string when no todos exist with default title');
    });

    test('Should return custom title when no todos exist but custom title is set', async () => {
        await todoManager.clearTodos();
        await todoManager.setTitle('Custom Empty Title');
        
        const title = todoManager.getTitle();
        assert.strictEqual(title, 'Custom Empty Title', 'Custom title should be shown even when no todos exist');
    });

    test('Should return base title for getBaseTitle even when empty', async () => {
        await todoManager.clearTodos();
        
        const baseTitle = todoManager.getBaseTitle();
        assert.strictEqual(baseTitle, 'Todos', 'Base title should always return the default title');
    });

    test('Should return formatted title with counts when todos exist', async () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Pending todo',
                status: 'pending',
                priority: 'medium'
            },
            {
                id: 'todo-2',
                content: 'Completed todo',
                status: 'completed',
                priority: 'high'
            },
            {
                id: 'todo-3',
                content: 'In progress todo',
                status: 'in_progress',
                priority: 'low'
            }
        ];

        await todoManager.setTodos(todos);

        const title = todoManager.getTitle();
        assert.strictEqual(title, 'Todos (1/3)', 'Title should show completed/total count when todos exist');
    });

    test('Should return formatted title with custom title when set', async () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }
        ];

        await todoManager.setTodos(todos, 'Custom Title');

        const title = todoManager.getTitle();
        assert.strictEqual(title, 'Custom Title (0/1)', 'Title should use custom title when provided');
        
        const baseTitle = todoManager.getBaseTitle();
        assert.strictEqual(baseTitle, 'Custom Title', 'Base title should reflect the custom title');
    });

    test('Should return empty string after clearing todos when title reverts to default', async () => {
        // First set some todos with a custom title
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            }
        ];

        await todoManager.setTodos(todos, 'Custom Title');
        
        // Then clear todos - this resets title to 'Todos'
        await todoManager.clearTodos();

        const title = todoManager.getTitle();
        assert.strictEqual(title, '', 'Title should be empty string when no todos exist and title is default');
        
        // But base title should be 'Todos'
        const baseTitle = todoManager.getBaseTitle();
        assert.strictEqual(baseTitle, 'Todos', 'Base title should revert to default after clearing');
    });
});