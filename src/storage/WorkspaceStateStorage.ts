import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ITodoStorage } from './ITodoStorage';
import { TodoItem } from '../types';

export class WorkspaceStateStorage extends EventEmitter implements ITodoStorage {
    private readonly storageKey = 'agentTodos.todos';
    
    constructor(private context: vscode.ExtensionContext) {
        super();
    }
    
    async load(): Promise<{ todos: TodoItem[], title: string }> {
        const storageData = this.context.workspaceState.get<{ todos: TodoItem[], title: string }>(this.storageKey);
        
        if (storageData) {
            return {
                todos: storageData.todos || [],
                title: storageData.title || 'Todos'
            };
        }
        
        return { todos: [], title: 'Todos' };
    }
    
    async save(todos: TodoItem[], title: string): Promise<void> {
        const storageData = { todos, title };
        await this.context.workspaceState.update(this.storageKey, storageData);
        this.emit('change');
    }
    
    async clear(): Promise<void> {
        await this.context.workspaceState.update(this.storageKey, { todos: [], title: 'Todos' });
        this.emit('change');
    }
    
    onDidChange(callback: () => void): { dispose: () => void } {
        this.on('change', callback);
        return {
            dispose: () => this.off('change', callback)
        };
    }
}