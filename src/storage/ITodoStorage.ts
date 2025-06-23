import { TodoItem } from '../types';

export interface ITodoStorage {
    /**
     * Load todos from storage
     * @returns Promise with todos array and optional title
     */
    load(): Promise<{ todos: TodoItem[], title: string }>;
    
    /**
     * Save todos to storage
     * @param todos Array of todo items
     * @param title Optional title for the todo list
     */
    save(todos: TodoItem[], title: string): Promise<void>;
    
    /**
     * Clear all todos from storage
     */
    clear(): Promise<void>;
    
    /**
     * Optional: Subscribe to storage changes
     * @param callback Function to call when storage changes
     * @returns Disposable to unsubscribe
     */
    onDidChange?(callback: () => void): { dispose: () => void };
}