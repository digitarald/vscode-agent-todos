import { EventEmitter } from 'events';
import { ITodoStorage } from './ITodoStorage';
import { TodoItem } from '../types';

export class InMemoryStorage extends EventEmitter implements ITodoStorage {
    private todos: TodoItem[] = [];
    private title: string = 'Todos';
    
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
}