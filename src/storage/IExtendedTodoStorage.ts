import { TodoItem, SavedTodoList } from '../types';
import { ITodoStorage } from './ITodoStorage';

export interface IExtendedTodoStorage extends ITodoStorage {
    /**
     * Load saved todo lists from storage
     * @returns Promise with array of saved todo lists
     */
    loadSavedLists(): Promise<SavedTodoList[]>;
    
    /**
     * Save saved todo lists to storage
     * @param savedLists Array of saved todo lists
     */
    saveSavedLists(savedLists: SavedTodoList[]): Promise<void>;
    
    /**
     * Clear all saved todo lists from storage
     */
    clearSavedLists(): Promise<void>;
}
