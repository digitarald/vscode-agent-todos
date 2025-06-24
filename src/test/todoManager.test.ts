import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { TodoItem, Subtask } from '../types';

suite('TodoManager Subtask Tests', () => {
    let todoManager: TodoManager;
    let testTodoId: string;

    setup(async () => {
        todoManager = TodoManager.getInstance();

        // Initialize with a mock context to ensure configuration works
        todoManager.initialize();

        // Create a test todo
        const testTodo: TodoItem = {
            id: 'test-todo-1',
            content: 'Test todo with subtasks',
            status: 'pending',
            priority: 'medium'
        };

        await todoManager.setTodos([testTodo]);
        testTodoId = testTodo.id;
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    test('Should add subtask to todo when subtasks are enabled', async () => {
        // Enable subtasks
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

        // Wait a bit for config to propagate
        await new Promise(resolve => setTimeout(resolve, 100));

        const subtask: Subtask = {
            id: 'subtask-1',
            content: 'Test subtask',
            status: 'pending'
        };

        await todoManager.addSubtask(testTodoId, subtask);

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);


        assert.strictEqual(todo?.subtasks?.length, 1);
        assert.strictEqual(todo?.subtasks?.[0].content, 'Test subtask');
        assert.strictEqual(todo?.subtasks?.[0].status, 'pending');
    });

    test('Should not add subtask when subtasks are disabled', async () => {
        // Disable subtasks
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', false);

        const subtask: Subtask = {
            id: 'subtask-1',
            content: 'Test subtask',
            status: 'pending'
        };

        await todoManager.addSubtask(testTodoId, subtask);

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.subtasks, undefined);
    });

    test('Should update subtask status', async () => {
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

        const subtask: Subtask = {
            id: 'subtask-1',
            content: 'Test subtask',
            status: 'pending'
        };

        await todoManager.addSubtask(testTodoId, subtask);
        await todoManager.updateSubtask(testTodoId, 'subtask-1', { status: 'completed' });

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.subtasks?.[0].status, 'completed');
    });

    test('Should toggle subtask status', async () => {
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

        const subtask: Subtask = {
            id: 'subtask-1',
            content: 'Test subtask',
            status: 'pending'
        };

        await todoManager.addSubtask(testTodoId, subtask);
        await todoManager.toggleSubtaskStatus(testTodoId, 'subtask-1');

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.subtasks?.[0].status, 'completed');

        // Toggle back
        await todoManager.toggleSubtaskStatus(testTodoId, 'subtask-1');
        const todosAfterSecondToggle = todoManager.getTodos();
        const todoAfterSecondToggle = todosAfterSecondToggle.find(t => t.id === testTodoId);

        assert.strictEqual(todoAfterSecondToggle?.subtasks?.[0].status, 'pending');
    });

    test('Should delete subtask', async () => {
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

        const subtask1: Subtask = {
            id: 'subtask-1',
            content: 'Test subtask 1',
            status: 'pending'
        };
        const subtask2: Subtask = {
            id: 'subtask-2',
            content: 'Test subtask 2',
            status: 'pending'
        };

        await todoManager.addSubtask(testTodoId, subtask1);
        await todoManager.addSubtask(testTodoId, subtask2);

        await todoManager.deleteSubtask(testTodoId, 'subtask-1');

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.subtasks?.length, 1);
        assert.strictEqual(todo?.subtasks?.[0].id, 'subtask-2');
    });

    test('Should set todo adr', async () => {
        const adr = 'Architecture decision record for this task';

        await todoManager.setTodoAdr(testTodoId, adr);

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.adr, adr);
    });

    test('Should clear todo adr', async () => {
        const adr = 'Architecture decision record for this task';

        await todoManager.setTodoAdr(testTodoId, adr);
        await todoManager.setTodoAdr(testTodoId, undefined);

        const todos = todoManager.getTodos();
        const todo = todos.find(t => t.id === testTodoId);

        assert.strictEqual(todo?.adr, undefined);
    });

    test('Should compare todos with subtasks correctly', async () => {
        await vscode.workspace.getConfiguration('agentTodos').update('enableSubtasks', true);

        const todo1: TodoItem = {
            id: 'todo-1',
            content: 'Todo 1',
            status: 'pending',
            priority: 'medium',
            subtasks: [
                { id: 's1', content: 'Subtask 1', status: 'pending' }
            ]
        };

        const todo2: TodoItem = {
            id: 'todo-1',
            content: 'Todo 1',
            status: 'pending',
            priority: 'medium',
            subtasks: [
                { id: 's1', content: 'Subtask 1', status: 'pending' }
            ]
        };

        const todo3: TodoItem = {
            id: 'todo-1',
            content: 'Todo 1',
            status: 'pending',
            priority: 'medium',
            subtasks: [
                { id: 's1', content: 'Subtask 1', status: 'completed' }
            ]
        };

        // Test private method through setTodos behavior
        await todoManager.setTodos([todo1]);
        const todos1 = todoManager.getTodos();

        await todoManager.setTodos([todo2]);
        const todos2 = todoManager.getTodos();

        // Should be equal (no change event should fire)
        assert.deepStrictEqual(todos1, todos2);

        await todoManager.setTodos([todo3]);
        const todos3 = todoManager.getTodos();

        // Should be different due to subtask status change
        assert.notDeepStrictEqual(todos1[0].subtasks?.[0].status, todos3[0].subtasks?.[0].status);
    });
});

suite('TodoManager Badge Tests', () => {
    let todoManager: TodoManager;

    setup(async () => {
        todoManager = TodoManager.getInstance();
        todoManager.initialize();
        await todoManager.clearTodos();
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    test('Should return correct not-completed count', async () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Pending todo',
                status: 'pending',
                priority: 'medium'
            },
            {
                id: 'todo-2',
                content: 'In progress todo',
                status: 'in_progress',
                priority: 'high'
            },
            {
                id: 'todo-3',
                content: 'Completed todo',
                status: 'completed',
                priority: 'low'
            }
        ];

        await todoManager.setTodos(todos);

        // Should return 2 (pending + in_progress)
        const notCompletedCount = todoManager.getNotCompletedCount();
        assert.strictEqual(notCompletedCount, 2);
    });

    test('Should return 0 when all todos are completed', async () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Completed todo 1',
                status: 'completed',
                priority: 'medium'
            },
            {
                id: 'todo-2',
                content: 'Completed todo 2',
                status: 'completed',
                priority: 'high'
            }
        ];

        await todoManager.setTodos(todos);

        const notCompletedCount = todoManager.getNotCompletedCount();
        assert.strictEqual(notCompletedCount, 0);
    });

    test('Should return 0 when no todos exist', async () => {
        await todoManager.clearTodos();

        const notCompletedCount = todoManager.getNotCompletedCount();
        assert.strictEqual(notCompletedCount, 0);
    });
});