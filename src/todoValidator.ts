import { TodoItem } from './types';
import { SubtaskManager } from './subtaskManager';

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
        if (todo.details !== undefined && typeof todo.details !== 'string') {
            return { valid: false, error: 'Todo details must be a string' };
        }

        // Validate subtasks if present
        if (todo.subtasks !== undefined) {
            if (!Array.isArray(todo.subtasks)) {
                return { valid: false, error: 'Subtasks must be an array' };
            }

            for (const subtask of todo.subtasks) {
                const subtaskValidation = SubtaskManager.validateSubtask(subtask);
                if (!subtaskValidation.valid) {
                    return { valid: false, error: `Subtask validation failed: ${subtaskValidation.error}` };
                }
            }
        }

        return { valid: true };
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

        // Compare details
        if (todo1.details !== todo2.details) {
            return false;
        }

        // Compare subtasks
        const subtasks1 = todo1.subtasks || [];
        const subtasks2 = todo2.subtasks || [];

        if (subtasks1.length !== subtasks2.length) {
            return false;
        }

        for (let i = 0; i < subtasks1.length; i++) {
            const s1 = subtasks1[i];
            const s2 = subtasks2[i];
            if (s1.id !== s2.id || s1.content !== s2.content || s1.status !== s2.status) {
                return false;
            }
        }

        return true;
    }

    /**
     * Sanitize and validate details
     */
    static sanitizeDetails(details: string | undefined): string | undefined {
        if (details === undefined || details.trim() === '') {
            return undefined;
        }
        
        // Trim and limit length
        const sanitized = details.trim();
        if (sanitized.length > 500) {
            return sanitized.substring(0, 500);
        }
        
        return sanitized;
    }
}