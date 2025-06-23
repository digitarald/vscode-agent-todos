import * as assert from 'assert';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { CopilotInstructionsStorage } from '../../storage/CopilotInstructionsStorage';
import { TodoItem } from '../../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

    suite('CopilotInstructionsStorage', () => {
        let storage: CopilotInstructionsStorage;
        let tempDir: string;
        let instructionsPath: string;

        setup(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todos-test-'));
            storage = new CopilotInstructionsStorage(tempDir);
            instructionsPath = path.join(tempDir, '.github', 'copilot-instructions.md');
        });

        teardown(() => {
            if (storage) {
                storage.dispose();
            }
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        test('Should initialize with empty todos when file does not exist', async () => {
            const data = await storage.load();
            assert.deepStrictEqual(data.todos, []);
            assert.strictEqual(data.title, 'Todos');
        });

        test('Should save todos to copilot-instructions.md', async () => {
            const todos: TodoItem[] = [
                { id: '1', content: 'Test todo', status: 'pending', priority: 'high' }
            ];
            
            await storage.save(todos, 'Test Title');
            
            assert.ok(fs.existsSync(instructionsPath));
            const content = fs.readFileSync(instructionsPath, 'utf8');
            assert.ok(content.includes('<todo title="Test Title">'));
            assert.ok(content.includes('- [ ] Test todo 🔴'));
        });

        test('Should parse todos from existing file', async () => {
            // Create a file with todos
            const content = `<!-- Auto-generated todo section -->
<todo title="Existing Todos">
> IMPORTANT: You don't need to use todo_read tool, as the list is already available below. Review it frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.

- [x] Completed task 🟢
- [-] In progress task 🟡
- [ ] Pending task 🔴
</todo>

<!-- Add your custom Copilot instructions below -->
`;
            
            fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });
            fs.writeFileSync(instructionsPath, content);
            
            const data = await storage.load();
            assert.strictEqual(data.title, 'Existing Todos');
            assert.strictEqual(data.todos.length, 3);
            assert.strictEqual(data.todos[0].status, 'completed');
            assert.strictEqual(data.todos[1].status, 'in_progress');
            assert.strictEqual(data.todos[2].status, 'pending');
        });

        test('Should preserve existing content when updating todos', async () => {
            const existingContent = `<!-- Auto-generated todo section -->
<todo>
- [ ] Old todo
</todo>

<!-- Add your custom Copilot instructions below -->
This is my custom content that should be preserved.
`;
            
            fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });
            fs.writeFileSync(instructionsPath, existingContent);
            
            const todos: TodoItem[] = [
                { id: '1', content: 'New todo', status: 'pending', priority: 'medium' }
            ];
            
            await storage.save(todos, 'New Title');
            
            const content = fs.readFileSync(instructionsPath, 'utf8');
            assert.ok(content.includes('This is my custom content that should be preserved.'));
            assert.ok(content.includes('New todo'));
            assert.ok(!content.includes('Old todo'));
        });
    });
});