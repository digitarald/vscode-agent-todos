import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { TodoItem } from '../types';

suite('Performance Improvements Tests', () => {
    let todoManager: TodoManager;

    setup(async () => {
        todoManager = TodoManager.getInstance();
        todoManager.initialize();
        await todoManager.clearTodos();
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    test('Should fire consolidated change event', async () => {
        let changeCount = 0;
        let lastChange: { todos: TodoItem[], title: string } | undefined;

        // Subscribe to consolidated event
        const disposable = todoManager.onDidChange((change) => {
            changeCount++;
            lastChange = change;
        });

        const todos: TodoItem[] = [{
            id: '1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Test Title');

        // Should have fired once
        assert.strictEqual(changeCount, 1);
        assert.strictEqual(lastChange?.todos.length, 1);
        assert.strictEqual(lastChange?.title, 'Test Title (0/1)');

        disposable.dispose();
    });

    test('Should not fire duplicate events', async () => {
        let changeCount = 0;

        // Subscribe to consolidated event
        const disposable = todoManager.onDidChange(() => changeCount++);

        const todos: TodoItem[] = [{
            id: '1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }];

        await todoManager.setTodos(todos, 'Test Title');

        // Event should fire once
        assert.strictEqual(changeCount, 1);

        // Setting same data should not fire events
        await todoManager.setTodos(todos, 'Test Title');
        
        assert.strictEqual(changeCount, 1);

        disposable.dispose();
    });

    test('Should handle rapid updates efficiently', async () => {
        let changeCount = 0;
        const disposable = todoManager.onDidChange(() => changeCount++);

        // Simulate rapid updates
        const updates = [];
        for (let i = 0; i < 10; i++) {
            updates.push(todoManager.setTodos([{
                id: `${i}`,
                content: `Todo ${i}`,
                status: 'pending',
                priority: 'medium'
            }]));
        }

        await Promise.all(updates);

        // Should have fired for each unique update
        assert.strictEqual(changeCount, 10);

        disposable.dispose();
    });

    test('Should detect actual changes correctly', async () => {
        let changeCount = 0;
        const disposable = todoManager.onDidChange(() => changeCount++);

        const todo1: TodoItem = {
            id: '1',
            content: 'Test',
            status: 'pending',
            priority: 'medium'
        };

        await todoManager.setTodos([todo1]);
        assert.strictEqual(changeCount, 1);

        // Same todo, no change
        await todoManager.setTodos([todo1]);
        assert.strictEqual(changeCount, 1);

        // Change status
        const todo2 = { ...todo1, status: 'completed' as const };
        await todoManager.setTodos([todo2]);
        assert.strictEqual(changeCount, 2);

        disposable.dispose();
    });
});