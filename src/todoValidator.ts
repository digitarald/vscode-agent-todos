import { TodoItem } from './types';

export class TodoValidator {
    /**
     * Validate a todo item
     */
    static validateTodo(todo: any): { valid: boolean; error?: string } {
        // Validate required fields
        if (!todo.id || typeof todo.id !== 'string') {
            return { valid: false, error: 'Todo must have a valid id' };
        }

        if (!todo.content || typeof todo.content !== 'string' || todo.content.trim().length === 0) {
            return { valid: false, error: 'Todo content cannot be empty' };
        }

        if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
            return { valid: false, error: 'Invalid todo status' };
        }

        if (!['low', 'medium', 'high'].includes(todo.priority)) {
            return { valid: false, error: 'Invalid todo priority' };
        }

        // Validate optional fields
        if (todo.adr !== undefined && typeof todo.adr !== 'string') {
            return { valid: false, error: 'Todo adr must be a string' };
        }

        return { valid: true };
    }

    /**
     * Validate multiple todos
     */
    static validateTodos(todos: any[]): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (!Array.isArray(todos)) {
            return { valid: false, errors: ['Todos must be an array'] };
        }
        
        // Validate each todo
        todos.forEach((todo, index) => {
            const validation = this.validateTodo(todo);
            if (!validation.valid) {
                errors.push(`Todo at index ${index}: ${validation.error}`);
            }
        });
        
        // Check for duplicate IDs
        const ids = todos.map(t => t.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
            errors.push('Duplicate todo IDs found');
        }
        
        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate that only one task is in progress
     */
    static validateSingleInProgress(todos: TodoItem[], excludeId?: string): boolean {
        const inProgressCount = todos.filter(t => 
            t.status === 'in_progress' && t.id !== excludeId
        ).length;
        return inProgressCount === 0;
    }

    /**
     * Compare two todo arrays for equality
     */
    static areTodosEqual(todos1: TodoItem[], todos2: TodoItem[]): boolean {
        if (todos1.length !== todos2.length) {
            return false;
        }

        for (let i = 0; i < todos1.length; i++) {
            if (!this.areTodoItemsEqual(todos1[i], todos2[i])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Compare two todo items for equality
     */
    static areTodoItemsEqual(todo1: TodoItem, todo2: TodoItem): boolean {
        // Compare basic properties
        if (todo1.id !== todo2.id ||
            todo1.content !== todo2.content ||
            todo1.status !== todo2.status ||
            todo1.priority !== todo2.priority) {
            return false;
        }

        // Compare adr
        if (todo1.adr !== todo2.adr) {
            return false;
        }

        return true;
    }

    /**
     * Sanitize and validate adr
     */
    static sanitizeAdr(adr: string | undefined): string | undefined {
        if (adr === undefined || adr.trim() === '') {
            return undefined;
        }
        
        // Trim and limit length
        const sanitized = adr.trim();
        if (sanitized.length > 500) {
            return sanitized.substring(0, 500);
        }
        
        return sanitized;
    }
}