import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { ITodoStorage } from './ITodoStorage';
import { IExtendedTodoStorage } from './IExtendedTodoStorage';
import { TodoItem, SavedTodoList } from '../types';

export class WorkspaceStateStorage extends EventEmitter implements IExtendedTodoStorage {
    private readonly storageKey = 'agentTodos.todos';
    private readonly savedListsKey = 'agentTodos.savedLists';
    
    constructor(private context: vscode.ExtensionContext) {
        super();
    }
    
    // WorkspaceStateStorage supports external changes (could be modified by other extension instances)
    get supportsExternalChanges(): boolean {
        return true;
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

    async loadSavedLists(): Promise<SavedTodoList[]> {
        const savedListsArray = this.context.workspaceState.get<SavedTodoList[]>(this.savedListsKey);

        if (savedListsArray && Array.isArray(savedListsArray)) {
            // Convert savedAt back to Date if it's a string
            return savedListsArray.map(savedList => ({
                ...savedList,
                savedAt: typeof savedList.savedAt === 'string' ? new Date(savedList.savedAt) : savedList.savedAt
            }));
        }

        return [];
    }

    async saveSavedLists(savedLists: SavedTodoList[]): Promise<void> {
        await this.context.workspaceState.update(this.savedListsKey, savedLists);
        this.emit('change');
    }

    async clearSavedLists(): Promise<void> {
        await this.context.workspaceState.update(this.savedListsKey, []);
        this.emit('change');
    }
}