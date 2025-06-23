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
            assert.ok(content.includes('<todos title="Test Title"'));
            assert.ok(content.includes('rule="Review steps frequently'));
            assert.ok(content.includes('- [ ] Test todo 🔴'));
        });

        test('Should parse todos from existing file', async () => {
            // Create a file with todos
            const content = `<!-- Auto-generated todo section -->
<todos title="Existing Todos" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [x] Completed task 🟢
- [-] In progress task 🟡
- [ ] Pending task 🔴
</todos>

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
<todos rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [ ] Old todo
</todos>

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

        test('Should parse todos with id: content format correctly', async () => {
            // Create a file with todos in the id: content format
            const content = `<!-- Auto-generated todo section -->
<todos title="Test Todos" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
- [x] todo-1-analyze-requirements: Analyze requirements and design approach for kids-friendly water tracking app 🔴
  _Define core features, user experience, and technical approach for a simple water tracking app suitable for children_
- [x] todo-2-create-typescript-in: Create TypeScript interfaces and types for water tracking data 🔴
- [ ] todo-3-implement-ui: Implement the user interface components 🟡
  - [x] subtask-1-design-layout: Design the main layout
  - [ ] subtask-2-add-interactions: Add user interactions
</todos>

<!-- Add your custom Copilot instructions below -->
`;

            fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });
            fs.writeFileSync(instructionsPath, content);

            const data = await storage.load();
            assert.strictEqual(data.title, 'Test Todos');
            assert.strictEqual(data.todos.length, 3);
            
            // Check that IDs are correctly parsed
            assert.strictEqual(data.todos[0].id, 'todo-1-analyze-requirements');
            assert.strictEqual(data.todos[0].content, 'Analyze requirements and design approach for kids-friendly water tracking app');
            assert.strictEqual(data.todos[0].status, 'completed');
            assert.strictEqual(data.todos[0].priority, 'high');
            assert.strictEqual(data.todos[0].details, 'Define core features, user experience, and technical approach for a simple water tracking app suitable for children');
            
            assert.strictEqual(data.todos[1].id, 'todo-2-create-typescript-in');
            assert.strictEqual(data.todos[1].content, 'Create TypeScript interfaces and types for water tracking data');
            assert.strictEqual(data.todos[1].status, 'completed');
            assert.strictEqual(data.todos[1].priority, 'high');
            
            assert.strictEqual(data.todos[2].id, 'todo-3-implement-ui');
            assert.strictEqual(data.todos[2].content, 'Implement the user interface components');
            assert.strictEqual(data.todos[2].status, 'pending');
            assert.strictEqual(data.todos[2].priority, 'medium');
            
            // Check subtasks are correctly parsed
            assert.ok(data.todos[2].subtasks);
            assert.strictEqual(data.todos[2].subtasks?.length, 2);
            assert.strictEqual(data.todos[2].subtasks?.[0].id, 'subtask-1-design-layout');
            assert.strictEqual(data.todos[2].subtasks?.[0].content, 'Design the main layout');
            assert.strictEqual(data.todos[2].subtasks?.[0].status, 'completed');
            assert.strictEqual(data.todos[2].subtasks?.[1].id, 'subtask-2-add-interactions');
            assert.strictEqual(data.todos[2].subtasks?.[1].content, 'Add user interactions');
            assert.strictEqual(data.todos[2].subtasks?.[1].status, 'pending');
        });
    });
});