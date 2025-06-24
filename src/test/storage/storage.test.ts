import * as assert from 'assert';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { TodoItem } from '../../types';

suite('Storage Tests', () => {
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
});