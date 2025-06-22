import { TodoItem, Subtask } from './types';

export class SubtaskManager {
    /**
     * Add a subtask to a todo item
     */
    static addSubtask(todo: TodoItem, subtask: Subtask): void {
        if (!todo.subtasks) {
            todo.subtasks = [];
        }
        todo.subtasks.push(subtask);
    }

    /**
     * Update a subtask within a todo item
     */
    static updateSubtask(todo: TodoItem, subtaskId: string, updates: Partial<Subtask>): boolean {
        if (!todo.subtasks) {
            return false;
        }

        const subtask = todo.subtasks.find(s => s.id === subtaskId);
        if (!subtask) {
            return false;
        }

        if (updates.content !== undefined) {
            subtask.content = updates.content;
        }
        if (updates.status !== undefined) {
            subtask.status = updates.status;
        }

        return true;
    }

    /**
     * Delete a subtask from a todo item
     */
    static deleteSubtask(todo: TodoItem, subtaskId: string): boolean {
        if (!todo.subtasks) {
            return false;
        }

        const initialLength = todo.subtasks.length;
        todo.subtasks = todo.subtasks.filter(s => s.id !== subtaskId);
        
        if (todo.subtasks.length === 0) {
            delete todo.subtasks;
        }

        return todo.subtasks?.length !== initialLength || initialLength === 1;
    }

    /**
     * Toggle subtask status between pending and completed
     */
    static toggleSubtaskStatus(todo: TodoItem, subtaskId: string): boolean {
        if (!todo.subtasks) {
            return false;
        }

        const subtask = todo.subtasks.find(s => s.id === subtaskId);
        if (!subtask) {
            return false;
        }

        subtask.status = subtask.status === 'pending' ? 'completed' : 'pending';
        return true;
    }

    /**
     * Count completed subtasks
     */
    static countCompletedSubtasks(todo: TodoItem): { completed: number; total: number } {
        if (!todo.subtasks || todo.subtasks.length === 0) {
            return { completed: 0, total: 0 };
        }

        const completed = todo.subtasks.filter(s => s.status === 'completed').length;
        return { completed, total: todo.subtasks.length };
    }

    /**
     * Generate a unique subtask ID
     */
    static generateSubtaskId(content: string): string {
        const timestamp = Date.now();
        const sanitized = content.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
        return `subtask-${timestamp}-${sanitized}`;
    }

    /**
     * Validate subtask structure
     */
    static validateSubtask(subtask: any): { valid: boolean; error?: string } {
        if (!subtask.id || typeof subtask.id !== 'string') {
            return { valid: false, error: 'Subtask must have a valid id' };
        }

        if (!subtask.content || typeof subtask.content !== 'string' || subtask.content.trim().length === 0) {
            return { valid: false, error: 'Subtask must have non-empty content' };
        }

        if (!['pending', 'completed'].includes(subtask.status)) {
            return { valid: false, error: 'Subtask status must be either pending or completed' };
        }

        return { valid: true };
    }
}