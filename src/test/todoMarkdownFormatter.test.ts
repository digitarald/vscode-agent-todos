import * as assert from 'assert';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';
import { TodoItem } from '../types';

describe('TodoMarkdownFormatter', () => {
    describe('formatTodosAsMarkdown', () => {
        it('should format todos with title', () => {
            const todos: TodoItem[] = [
                {
                    id: 'todo-1',
                    content: 'First task',
                    status: 'pending',
                    priority: 'high'
                },
                {
                    id: 'todo-2',
                    content: 'Second task',
                    status: 'completed',
                    priority: 'medium'
                }
            ];
            
            const result = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, 'My Tasks', true);
            
            assert.strictEqual(result.includes('# My Tasks'), true);
            assert.strictEqual(result.includes('- [ ] todo-1: First task 🔴'), true);
            assert.strictEqual(result.includes('- [x] todo-2: Second task 🟡'), true);
        });

        it('should format todos with subtasks', () => {
            const todos: TodoItem[] = [
                {
                    id: 'todo-1',
                    content: 'Main task',
                    status: 'in_progress',
                    priority: 'high',
                    subtasks: [
                        { id: 'sub-1', content: 'Subtask 1', status: 'completed' },
                        { id: 'sub-2', content: 'Subtask 2', status: 'pending' }
                    ]
                }
            ];
            
            const result = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, true);
            
            assert.strictEqual(result.includes('- [-] todo-1: Main task 🔴'), true);
            assert.strictEqual(result.includes('  - [x] sub-1: Subtask 1'), true);
            assert.strictEqual(result.includes('  - [ ] sub-2: Subtask 2'), true);
        });

        it('should format todos with ADR', () => {
            const todos: TodoItem[] = [
                {
                    id: 'todo-1',
                    content: 'Task with decision',
                    status: 'pending',
                    priority: 'low',
                    adr: 'This is an important decision'
                }
            ];
            
            const result = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, true);
            
            assert.strictEqual(result.includes('- [ ] todo-1: Task with decision 🟢'), true);
            assert.strictEqual(result.includes('  _This is an important decision_'), true);
        });
    });

    describe('parseMarkdown', () => {
        it('should parse markdown with title', () => {
            const markdown = `# My Tasks

- [ ] todo-1: First task 🔴
- [x] todo-2: Second task 🟡`;
            
            const result = TodoMarkdownFormatter.parseMarkdown(markdown);
            
            assert.strictEqual(result.title, 'My Tasks');
            assert.strictEqual(result.todos.length, 2);
            assert.deepStrictEqual(result.todos[0], {
                id: 'todo-1',
                content: 'First task',
                status: 'pending',
                priority: 'high',
                subtasks: []
            });
            assert.deepStrictEqual(result.todos[1], {
                id: 'todo-2',
                content: 'Second task',
                status: 'completed',
                priority: 'medium',
                subtasks: []
            });
        });

        it('should parse todos with subtasks', () => {
            const markdown = `- [-] todo-1: Main task 🔴
  - [x] sub-1: Subtask 1
  - [ ] sub-2: Subtask 2`;
            
            const result = TodoMarkdownFormatter.parseMarkdown(markdown);
            
            assert.strictEqual(result.todos.length, 1);
            assert.strictEqual(result.todos[0].status, 'in_progress');
            assert.strictEqual(result.todos[0].subtasks!.length, 2);
            assert.deepStrictEqual(result.todos[0].subtasks![0], {
                id: 'sub-1',
                content: 'Subtask 1',
                status: 'completed'
            });
        });

        it('should parse todos with ADR', () => {
            const markdown = `- [ ] todo-1: Task with decision 🟢
  _This is an important decision_`;
            
            const result = TodoMarkdownFormatter.parseMarkdown(markdown);
            
            assert.strictEqual(result.todos.length, 1);
            assert.strictEqual(result.todos[0].adr, 'This is an important decision');
        });
    });

    describe('validateAndSanitizeTodos', () => {
        it('should generate unique IDs for duplicates', () => {
            const todos: TodoItem[] = [
                { id: 'todo-1', content: 'Task 1', status: 'pending', priority: 'medium' },
                { id: 'todo-1', content: 'Task 2', status: 'pending', priority: 'medium' }
            ];
            
            const result = TodoMarkdownFormatter.validateAndSanitizeTodos(todos);
            
            assert.strictEqual(result.length, 2);
            assert.notStrictEqual(result[0].id, result[1].id);
        });

        it('should skip todos with empty content', () => {
            const todos: TodoItem[] = [
                { id: 'todo-1', content: 'Valid task', status: 'pending', priority: 'medium' },
                { id: 'todo-2', content: '', status: 'pending', priority: 'medium' },
                { id: 'todo-3', content: '   ', status: 'pending', priority: 'medium' }
            ];
            
            const result = TodoMarkdownFormatter.validateAndSanitizeTodos(todos);
            
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].content, 'Valid task');
        });

        it('should fix invalid status and priority', () => {
            const todos: any[] = [
                { id: 'todo-1', content: 'Task', status: 'invalid', priority: 'wrong' }
            ];
            
            const result = TodoMarkdownFormatter.validateAndSanitizeTodos(todos);
            
            assert.strictEqual(result[0].status, 'pending');
            assert.strictEqual(result[0].priority, 'medium');
        });
    });
});