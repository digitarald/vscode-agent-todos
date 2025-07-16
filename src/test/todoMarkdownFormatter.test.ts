import * as assert from 'assert';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';
import { TodoItem } from '../types';

suite('TodoMarkdownFormatter Tests', () => {
    test('Should format todos with subtasks', () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
                subtasks: [
                    { id: 'sub-1', content: 'Subtask 1', status: 'pending' },
                    { id: 'sub-2', content: 'Subtask 2', status: 'completed' }
                ]
            }
        ];

        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, true);
        
        assert.ok(markdown.includes('- [ ] todo-1: Main task 🔴'));
        assert.ok(markdown.includes('  - [ ] sub-1: Subtask 1'));
        assert.ok(markdown.includes('  - [x] sub-2: Subtask 2'));
    });

    test('Should format todos with ADR', () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'completed',
                priority: 'medium',
                adr: 'Used async/await pattern for better error handling'
            }
        ];

        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, true);
        
        assert.ok(markdown.includes('- [x] todo-1: Main task 🟡'));
        assert.ok(markdown.includes('  _Used async/await pattern for better error handling_'));
    });
});
