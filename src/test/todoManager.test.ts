import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { TodoItem, Subtask } from '../types';

suite('TodoManager Core Tests', () => {
    let todoManager: TodoManager;
    let context: vscode.ExtensionContext;

    setup(async () => {
        // Mock context with workspaceState
        const workspaceState = new Map<string, any>();
        context = {
            subscriptions: [],
            workspaceState: {
                get: (key: string) => workspaceState.get(key),
                update: async (key: string, value: any) => {
                    workspaceState.set(key, value);
                }
            }
        } as any;

        todoManager = TodoManager.getInstance();
        todoManager.initialize(context);
        await todoManager.clearTodos();
    });

    teardown(async () => {
        await todoManager.clearTodos();
    });

    suite('Basic Operations', () => {
        test('Should add and retrieve todos', async () => {
            const testTodo: TodoItem = {
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            };

            await todoManager.setTodos([testTodo]);
            const todos = todoManager.getTodos();

            assert.strictEqual(todos.length, 1);
            assert.strictEqual(todos[0].content, 'Test todo');
            assert.strictEqual(todos[0].status, 'pending');
        });

        test('Should update todo status', async () => {
            const testTodo: TodoItem = {
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            };

            await todoManager.setTodos([testTodo]);
            await todoManager.setTodoStatus('test-1', 'completed');

            const todos = todoManager.getTodos();
            assert.strictEqual(todos[0].status, 'completed');
        });

        test('Should delete todo', async () => {
            const testTodo: TodoItem = {
                id: 'test-1',
                content: 'Test todo',
                status: 'pending',
                priority: 'medium'
            };

            await todoManager.setTodos([testTodo]);
            await todoManager.deleteTodo('test-1');

            const todos = todoManager.getTodos();
            assert.strictEqual(todos.length, 0);
        });

        test('Should clear all todos', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Todo 1', status: 'pending', priority: 'high' },
                { id: '2', content: 'Todo 2', status: 'completed', priority: 'low' }
            ];

            await todoManager.setTodos(todos);
            await todoManager.clearTodos();

            assert.strictEqual(todoManager.getTodos().length, 0);
        });
    });

    suite('Subtask Management', () => {
        let testTodoId: string;

        setup(async () => {
            const testTodo: TodoItem = {
                id: 'test-todo-1',
                content: 'Test todo with subtasks',
                status: 'pending',
                priority: 'medium'
            };

            await todoManager.setTodos([testTodo]);
            testTodoId = testTodo.id;
        });

        test('Should add subtask when subtasks are enabled', async () => {
            await new Promise(resolve => setTimeout(resolve, 100));

            const subtask: Subtask = {
                id: 'subtask-1',
                content: 'Test subtask',
                status: 'pending'
            };


            const todos = todoManager.getTodos();
            const todo = todos.find(t => t.id === testTodoId);

            assert.strictEqual(todo?.subtasks?.length, 1);
            assert.strictEqual(todo?.subtasks?.[0].content, 'Test subtask');
        });

        test('Should not add subtask when subtasks are disabled', async () => {

            const subtask: Subtask = {
                id: 'subtask-1',
                content: 'Test subtask',
                status: 'pending'
            };


            const todos = todoManager.getTodos();
            const todo = todos.find(t => t.id === testTodoId);

            assert.strictEqual(todo?.subtasks, undefined);
        });

        test('Should toggle subtask status', async () => {

            const subtask: Subtask = {
                id: 'subtask-1',
                content: 'Test subtask',
                status: 'pending'
            };


            const todos = todoManager.getTodos();
            const todo = todos.find(t => t.id === testTodoId);

            assert.strictEqual(todo?.subtasks?.[0].status, 'completed');

            // Toggle back
            const todosAfterSecondToggle = todoManager.getTodos();
            const todoAfterSecondToggle = todosAfterSecondToggle.find(t => t.id === testTodoId);

            assert.strictEqual(todoAfterSecondToggle?.subtasks?.[0].status, 'pending');
        });

        test('Should delete subtask', async () => {

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


            const todos = todoManager.getTodos();
            const todo = todos.find(t => t.id === testTodoId);

            assert.strictEqual(todo?.subtasks?.length, 1);
            assert.strictEqual(todo?.subtasks?.[0].id, 'subtask-2');
        });
    });

    suite('ADR (Architecture Decision Records)', () => {
        let testTodoId: string;

        setup(async () => {
            const testTodo: TodoItem = {
                id: 'adr-test',
                content: 'Test todo for ADR',
                status: 'pending',
                priority: 'medium'
            };

            await todoManager.setTodos([testTodo]);
            testTodoId = testTodo.id;
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
    });

    suite('Title Management', () => {
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
                { id: 'todo-1', content: 'Pending todo', status: 'pending', priority: 'medium' },
                { id: 'todo-2', content: 'Completed todo', status: 'completed', priority: 'high' },
                { id: 'todo-3', content: 'In progress todo', status: 'in_progress', priority: 'low' }
            ];

            await todoManager.setTodos(todos);

            const title = todoManager.getTitle();
            assert.strictEqual(title, 'Todos (1/3)', 'Title should show completed/total count when todos exist');
        });

        test('Should return formatted title with custom title when set', async () => {
            const todos: TodoItem[] = [
                { id: 'todo-1', content: 'Test todo', status: 'pending', priority: 'medium' }
            ];

            await todoManager.setTodos(todos, 'Custom Title');

            const title = todoManager.getTitle();
            assert.strictEqual(title, 'Custom Title (0/1)', 'Title should use custom title when provided');

            const baseTitle = todoManager.getBaseTitle();
            assert.strictEqual(baseTitle, 'Custom Title', 'Base title should reflect the custom title');
        });
    });

    suite('Badge and Count Management', () => {
        test('Should return correct not-completed count', async () => {
            const todos: TodoItem[] = [
                { id: 'todo-1', content: 'Pending todo', status: 'pending', priority: 'medium' },
                { id: 'todo-2', content: 'In progress todo', status: 'in_progress', priority: 'high' },
                { id: 'todo-3', content: 'Completed todo', status: 'completed', priority: 'low' }
            ];

            await todoManager.setTodos(todos);

            // Should return 2 (pending + in_progress)
            const notCompletedCount = todoManager.getNotCompletedCount();
            assert.strictEqual(notCompletedCount, 2);
        });

        test('Should return 0 when all todos are completed', async () => {
            const todos: TodoItem[] = [
                { id: 'todo-1', content: 'Completed todo 1', status: 'completed', priority: 'medium' },
                { id: 'todo-2', content: 'Completed todo 2', status: 'completed', priority: 'high' }
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

    suite('Event System and Performance', () => {
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

        test('Should compare todos with subtasks correctly', async () => {

            const todo1: TodoItem = {
                id: 'todo-1',
                content: 'Todo 1',
                status: 'pending',
                priority: 'medium',
            };

            const todo2: TodoItem = {
                id: 'todo-1',
                content: 'Todo 1',
                status: 'pending',
                priority: 'medium',
            };

            const todo3: TodoItem = {
                id: 'todo-1',
                content: 'Todo 1',
                status: 'pending',
                priority: 'medium',
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
});