import * as assert from 'assert';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';
import { TodoItem } from '../types';

suite('TodoMarkdownFormatter Tests', () => {
    test('Should format basic todos', () => {
        const todos: TodoItem[] = [
            {
                id: 'todo-1',
                content: 'Main task',
                status: 'pending',
                priority: 'high',
            }
        ];

        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined);
        
        assert.ok(markdown.includes('- [ ] todo-1: Main task 🔴'));
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

        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined);
        
        assert.ok(markdown.includes('- [x] todo-1: Main task 🟡'));
        assert.ok(markdown.includes('  _Used async/await pattern for better error handling_'));
    });
});
