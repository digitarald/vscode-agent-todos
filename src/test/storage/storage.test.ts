import * as assert from 'assert';
import * as vscode from 'vscode';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { WorkspaceStateStorage } from '../../storage/WorkspaceStateStorage';
import { ITodoStorage } from '../../storage/ITodoStorage';
import { TodoItem } from '../../types';

suite('Storage Layer Tests', () => {
    suite('InMemoryStorage', () => {
        let storage: InMemoryStorage;

        setup(() => {
            storage = new InMemoryStorage();
        });

        test('Should initialize with empty todos', async () => {
            const data = await storage.load();
            assert.deepStrictEqual(data.todos, []);
            assert.strictEqual(data.title, 'Todos');
        });

        test('Should save and load todos', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Test todo', status: 'pending', priority: 'medium' }
            ];

            await storage.save(todos, 'Test Title');
            const data = await storage.load();

            assert.deepStrictEqual(data.todos, todos);
            assert.strictEqual(data.title, 'Test Title');
        });

        test('Should clear todos', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Test todo', status: 'pending', priority: 'medium' }
            ];

            await storage.save(todos, 'Test Title');
            await storage.clear();

            const data = await storage.load();
            assert.deepStrictEqual(data.todos, []);
            assert.strictEqual(data.title, 'Todos');
        });

        test('Should notify on changes', (done) => {
            let changeCount = 0;

            const disposable = storage.onDidChange(() => {
                changeCount++;
                if (changeCount === 2) {
                    disposable.dispose();
                    done();
                }
            });

            storage.save([], 'Test').then(() => {
                return storage.clear();
            });
        });
    });

    suite('WorkspaceStateStorage', () => {
        let storage: WorkspaceStateStorage;
        let context: vscode.ExtensionContext;

        setup(() => {
            // Mock extension context
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

            storage = new WorkspaceStateStorage(context);
        });

        test('Should save and load from workspace state', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Workspace todo', status: 'completed', priority: 'high' }
            ];

            await storage.save(todos, 'Workspace Test');
            const data = await storage.load();

            assert.deepStrictEqual(data.todos, todos);
            assert.strictEqual(data.title, 'Workspace Test');
        });

        test('Should handle empty workspace state', async () => {
            const data = await storage.load();
            assert.deepStrictEqual(data.todos, []);
            assert.strictEqual(data.title, 'Todos');
        });

        test('Should notify on workspace state changes', (done) => {
            const disposable = storage.onDidChange(() => {
                disposable.dispose();
                done();
            });

            storage.save([{ id: '1', content: 'Test', status: 'pending', priority: 'low' }], 'Test');
        });
    });

    suite('Storage Interface Compliance', () => {
        const storageImplementations: Array<{ name: string; factory: () => ITodoStorage }> = [
            {
                name: 'InMemoryStorage',
                factory: () => new InMemoryStorage()
            },
            {
                name: 'WorkspaceStateStorage',
                factory: () => {
                    const workspaceState = new Map<string, any>();
                    const context = {
                        subscriptions: [],
                        workspaceState: {
                            get: (key: string) => workspaceState.get(key),
                            update: async (key: string, value: any) => {
                                workspaceState.set(key, value);
                            }
                        }
                    } as any;
                    return new WorkspaceStateStorage(context);
                }
            }
        ];

        storageImplementations.forEach(({ name, factory }) => {
            suite(name, () => {
                let storage: ITodoStorage;

                setup(() => {
                    storage = factory();
                });

                test('Should implement all required methods', () => {
                    assert.ok(typeof storage.load === 'function');
                    assert.ok(typeof storage.save === 'function');
                    assert.ok(typeof storage.clear === 'function');
                    assert.ok(typeof storage.onDidChange === 'function');
                });

                test('Should handle complex todo structures', async () => {
                    const complexTodos: TodoItem[] = [
                        {
                            id: 'complex-1',
                            content: 'Task with everything',
                            status: 'in_progress',
                            priority: 'high',
                            adr: 'Important architectural decision made here'
                        }
                    ];

                    await storage.save(complexTodos, 'Complex Test');
                    const data = await storage.load();

                    assert.deepStrictEqual(data.todos, complexTodos);
                    assert.strictEqual(data.title, 'Complex Test');
                });

                test('Should preserve data through multiple operations', async () => {
                    const todos1: TodoItem[] = [
                        { id: '1', content: 'First', status: 'pending', priority: 'high' }
                    ];

                    const todos2: TodoItem[] = [
                        { id: '1', content: 'First', status: 'completed', priority: 'high' },
                        { id: '2', content: 'Second', status: 'pending', priority: 'medium' }
                    ];

                    await storage.save(todos1, 'First Save');
                    let data = await storage.load();
                    assert.strictEqual(data.todos.length, 1);

                    await storage.save(todos2, 'Second Save');
                    data = await storage.load();
                    assert.strictEqual(data.todos.length, 2);
                    assert.strictEqual(data.title, 'Second Save');

                    await storage.clear();
                    data = await storage.load();
                    assert.strictEqual(data.todos.length, 0);
                    assert.strictEqual(data.title, 'Todos');
                });
            });
        });
    });
});