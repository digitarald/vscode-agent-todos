// Standalone todo manager without VS Code dependencies
import { TodoItem, TodoStatus, TodoPriority, SavedTodoList } from '../types';
import { TodoValidator } from '../todoValidator';
import { EventEmitter } from 'events';
import { ITodoStorage } from '../storage/ITodoStorage';
import { IExtendedTodoStorage } from '../storage/IExtendedTodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { StandaloneCopilotWriter } from './standaloneCopilotWriter';
import { generateUniqueSlug } from '../utils/slugUtils';
import { areListsExactMatch } from '../utils/listComparison';

export class StandaloneTodoManager extends EventEmitter {
  private static instance: StandaloneTodoManager | null = null;
  private todos: TodoItem[] = [];
  private title: string = 'Todos';
  // Saved lists storage for previous todo lists
  private savedLists: Map<string, SavedTodoList> = new Map();
  private storage: ITodoStorage;
  private extendedStorage: IExtendedTodoStorage | undefined;
  private storageDisposable: { dispose: () => void } | undefined;
  private lastUpdateHash: string = '';
  private updateVersion: number = 0;
  private copilotWriter: StandaloneCopilotWriter | null = null;
  private isSaving: boolean = false;
  private initializationPromise: Promise<void>;
  private isInitialized: boolean = false;
  
  constructor(storage?: ITodoStorage, autoInjectConfig?: { workspaceRoot: string; filePath?: string }) {
    super();
    this.storage = storage || new InMemoryStorage();
    // Check if storage supports extended features
    this.extendedStorage = 'loadSavedLists' in this.storage &&
      'saveSavedLists' in this.storage &&
      'clearSavedLists' in this.storage
      ? this.storage as IExtendedTodoStorage
      : undefined;

    if (autoInjectConfig) {
      this.setAutoInject(autoInjectConfig);
    }

    this.initializationPromise = this.initialize();
  }
  
  static getInstance(storage?: ITodoStorage, autoInjectConfig?: { workspaceRoot: string; filePath?: string }): StandaloneTodoManager {
    if (!StandaloneTodoManager.instance || storage) {
      StandaloneTodoManager.instance = new StandaloneTodoManager(storage, autoInjectConfig);
    }
    return StandaloneTodoManager.instance;
  }
  
  private async initialize(): Promise<void> {
    // Load initial data
    await this.loadTodos();
    
    // Load saved lists
    this.loadSavedListsFromStorage();

    // Subscribe to storage changes if supported and the storage supports external changes
    // For InMemoryStorage, we don't need to subscribe since it's single-instance
    const isInMemoryStorage = this.storage.constructor.name === 'InMemoryStorage';
    if (this.storage.onDidChange && !isInMemoryStorage) {
      this.storageDisposable = this.storage.onDidChange(() => {
        // Don't reload if we're currently saving (prevents recursive loop)
        if (!this.isSaving) {
          this.loadTodos();
          this.loadSavedListsFromStorage();
        }
      });
    }
    
    this.isInitialized = true;
  }
  
  private async loadTodos(): Promise<void> {
    try {
      const data = await this.storage.load();
      this.todos = data.todos || [];
      this.title = data.title || 'Todos';
      this.fireChangeEvent();
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  }
  
  private async saveTodos(): Promise<void> {
    try {
      this.isSaving = true;
      await this.storage.save(this.todos, this.title);
      
      // Also write to copilot instructions if enabled
      if (this.copilotWriter) {
        await this.copilotWriter.updateInstructionsWithTodos(this.todos, this.title);
      }
    } catch (error) {
      console.error('Failed to save todos:', error);
    } finally {
      this.isSaving = false;
    }
  }
  
  getTodos(): TodoItem[] {
    return [...this.todos];
  }
  
  getTitle(): string {
    return this.title;
  }
  
  getBaseTitle(): string {
    return this.title;
  }

  async setTitle(title: string): Promise<void> {
    this.title = title;
    await this.saveTodos();
    this.fireChangeEvent();
  }
  
  async updateTodos(todos: TodoItem[], title?: string): Promise<void> {
    // Wait for initialization to complete
    await this.initializationPromise;
    
    const validationResult = TodoValidator.validateTodos(todos);
    if (!validationResult.valid) {
      throw new Error(validationResult.errors.join(', '));
    }

    // Save current list ONLY when title is explicitly changing to a different value
    // This prevents duplicate archives when just updating todo statuses within same project
    if (this.todos.length > 0 && this.title !== 'Todos' && 
        title !== undefined && title !== this.title) {
      const reason = `title change from "${this.title}" to "${title}"`;
      this.saveCurrentList(reason);
    }
    
    this.todos = todos;
    if (title !== undefined) {
      this.title = title;
    }
    await this.saveTodos();  // Wait for save to complete
    this.fireChangeEvent();
  }
  
  // Alias for updateTodos to match VS Code TodoManager interface
  async setTodos(todos: TodoItem[], title?: string): Promise<void> {
    return this.updateTodos(todos, title);
  }
  
  async clearTodos(): Promise<void> {
    this.todos = [];
    await this.saveTodos();
    
    // Remove from copilot instructions if enabled
    if (this.copilotWriter) {
      await this.copilotWriter.removeInstructionsTodos();
    }
    
    this.fireChangeEvent();
  }
  
  async deleteTodo(todoId: string): Promise<void> {
    this.todos = this.todos.filter(todo => todo.id !== todoId);
    await this.saveTodos();
    this.fireChangeEvent();
  }
  
  async toggleTodoStatus(todoId: string): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      const statusMap: Record<TodoStatus, TodoStatus> = {
        'pending': 'in_progress',
        'in_progress': 'completed',
        'completed': 'pending'
      };
      todo.status = statusMap[todo.status];
      await this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  async setTodoStatus(todoId: string, status: TodoStatus): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      todo.status = status;
      this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  async setTodoPriority(todoId: string, priority: TodoPriority): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      todo.priority = priority;
      this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  async setTodoAdr(todoId: string, adr: string | undefined): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      todo.adr = adr;
      this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  private fireChangeEvent(): void {
    let previousTodoCount = 0;
    let isEmptyTransition = false;
    
    try {
      if (this.lastUpdateHash) {
        const previousData = JSON.parse(this.lastUpdateHash);
        previousTodoCount = previousData.todos?.length || 0;
      }
    } catch (e) {
      // Ignore parse errors
    }
    
    const currentTodoCount = this.todos.length;
    isEmptyTransition = (previousTodoCount > 0 && currentTodoCount === 0) ||
                       (previousTodoCount === 0 && currentTodoCount > 0);
    
    // Include version in hash for forced updates
    const currentHash = JSON.stringify({ 
      todos: this.todos, 
      title: this.title,
      version: isEmptyTransition ? ++this.updateVersion : this.updateVersion
    });
    
    if (currentHash !== this.lastUpdateHash || isEmptyTransition) {
      console.log(`[StandaloneTodoManager] Firing change event: ${previousTodoCount} -> ${currentTodoCount} todos, title: "${this.title}"${isEmptyTransition ? ' (empty transition)' : ''}`);
      this.lastUpdateHash = currentHash;
      // Emit consolidated change event
      this.emit('change', { todos: this.getTodos(), title: this.getTitle() });
    } else {
      console.log('[StandaloneTodoManager] No change detected, skipping event');
    }
  }

  // Provide VS Code-compatible event interface
  onDidChange(callback: (change: { todos: TodoItem[], title: string }) => void): { dispose: () => void } {
    this.on('change', callback);
    return {
      dispose: () => {
        this.off('change', callback);
      }
    };
  }
  
  onShouldOpenView(callback: () => void): { dispose: () => void } {
    // Not applicable in standalone mode
    return { dispose: () => {} };
  }

  // Saved list management methods
  getSavedLists(): SavedTodoList[] {
    return Array.from(this.savedLists.values()).sort((a, b) => 
      b.savedAt.getTime() - a.savedAt.getTime()
    );
  }

  getSavedListBySlug(slug: string): SavedTodoList | undefined {
    return this.savedLists.get(slug);
  }

  getSavedListSlugs(): string[] {
    return Array.from(this.savedLists.keys());
  }

  clearSavedLists(): void {
    this.savedLists.clear();
    this.saveSavedListsToStorage();
    this.emit('savedListChange');
    console.log('[StandaloneTodoManager] Cleared all saved todo lists');
  }

  deleteSavedList(slug: string): boolean {
    const deleted = this.savedLists.delete(slug);
    if (deleted) {
      this.saveSavedListsToStorage();
      this.emit('savedListChange');
      console.log(`[StandaloneTodoManager] Deleted saved todo list with slug: ${slug}`);
    }
    return deleted;
  }

  private shouldPersistSavedLists(): boolean {
    // Only persist saved lists when using storage that supports extended features and can synchronize
    return this.extendedStorage !== undefined && this.storage.supportsExternalChanges !== false;
  }

  private saveSavedListsToStorage(): void {
    if (!this.shouldPersistSavedLists() || !this.extendedStorage) {
      return; // Don't persist saved lists for storage without extended support
    }

    try {
      const savedListsArray = Array.from(this.savedLists.values());
      this.extendedStorage.saveSavedLists(savedListsArray);
      console.log(`[StandaloneTodoManager] Saved ${savedListsArray.length} saved lists to storage`);
    } catch (error) {
      console.error('[StandaloneTodoManager] Failed to save saved lists to storage:', error);
    }
  }

  private loadSavedListsFromStorage(): void {
    if (!this.shouldPersistSavedLists() || !this.extendedStorage) {
      return; // Don't load saved lists for storage without extended support
    }

    try {
      this.extendedStorage.loadSavedLists().then(savedListsArray => {
        this.savedLists.clear();
        for (const savedList of savedListsArray) {
          this.savedLists.set(savedList.slug, savedList);
        }
        console.log(`[StandaloneTodoManager] Loaded ${savedListsArray.length} saved lists from storage`);
      }).catch(error => {
        console.error('[StandaloneTodoManager] Failed to load saved lists from storage:', error);
      });
    } catch (error) {
      console.error('[StandaloneTodoManager] Failed to load saved lists from storage:', error);
    }
  }

  onSavedListChange(callback: () => void): { dispose: () => void } {
    this.on('savedListChange', callback);
    return {
      dispose: () => {
        this.off('savedListChange', callback);
      }
    };
  }

  private saveCurrentList(reason: string = 'title change'): void {
    // Only save if we have todos and a non-default title
    if (this.todos.length > 0 && this.title !== 'Todos') {
      // Create the potential saved list to check for duplicates
      const potentialSaved: SavedTodoList = {
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        title: this.title,
        todos: [...this.todos],
        savedAt: new Date(),
        slug: '' // Will be set after duplicate check
      };

      // Check for exact duplicates in existing saved lists
      const existingLists = Array.from(this.savedLists.values());
      for (const existingList of existingLists) {
        if (areListsExactMatch(potentialSaved, existingList)) {
          console.log(`[StandaloneTodoManager] Prevented duplicate save of "${this.title}" (${reason}) - exact match found with existing list "${existingList.slug}" saved at ${existingList.savedAt.toISOString()}`);
          return; // Silent prevention - do not save duplicate
        }
      }

      // No duplicate found, proceed with saving
      const existingSlugs = new Set(this.savedLists.keys());
      const slug = generateUniqueSlug(this.title, existingSlugs);
      potentialSaved.slug = slug;

      this.savedLists.set(slug, potentialSaved);
      console.log(`[StandaloneTodoManager] Saved todo list "${this.title}" as "${slug}" (${reason}), ${this.todos.length} todos`);
      
      // Persist saved lists to storage
      this.saveSavedListsToStorage();

      // Notify saved list change listeners
      this.emit('savedListChange');
    }
  }
  
  setAutoInject(config: { workspaceRoot: string; filePath?: string } | null): void {
    if (config) {
      this.copilotWriter = new StandaloneCopilotWriter(config.workspaceRoot, config.filePath);
      // Write current todos to file
      this.copilotWriter.updateInstructionsWithTodos(this.todos, this.title);
    } else {
      // Remove todos from file if disabling
      if (this.copilotWriter) {
        this.copilotWriter.removeInstructionsTodos();
      }
      this.copilotWriter = null;
    }
  }
  
  
  dispose(): void {
    if (this.storageDisposable) {
      this.storageDisposable.dispose();
    }
    this.removeAllListeners();
    this.copilotWriter = null;
  }
}