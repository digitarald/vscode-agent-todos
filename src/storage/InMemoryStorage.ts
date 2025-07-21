import { EventEmitter } from 'events';
import { ITodoStorage } from './ITodoStorage';
import { IExtendedTodoStorage } from './IExtendedTodoStorage';
import { TodoItem, SavedTodoList } from '../types';

export class InMemoryStorage extends EventEmitter implements IExtendedTodoStorage {
    private todos: TodoItem[] = [];
    private title: string = 'Todos';
    private savedLists: SavedTodoList[] = [];
    
    constructor() {
        super();
    }
    
    // InMemoryStorage doesn't support external changes - it's only used by one manager instance
    get supportsExternalChanges(): boolean {
        return false;
    }
    
    async load(): Promise<{ todos: TodoItem[], title: string }> {
        return { todos: [...this.todos], title: this.title };
    }
    
    async save(todos: TodoItem[], title: string): Promise<void> {
        this.todos = [...todos];
        this.title = title;
        this.emit('change');
    }
    
    async clear(): Promise<void> {
        this.todos = [];
        this.title = 'Todos';
        this.emit('change');
    }
    
    onDidChange(callback: () => void): { dispose: () => void } {
        this.on('change', callback);
        return {
            dispose: () => this.off('change', callback)
        };
    }

    async loadSavedLists(): Promise<SavedTodoList[]> {
        return [...this.savedLists];
    }

    async saveSavedLists(savedLists: SavedTodoList[]): Promise<void> {
        this.savedLists = [...savedLists];
        this.emit('change');
    }

    async clearSavedLists(): Promise<void> {
        this.savedLists = [];
        this.emit('change');
    }
}