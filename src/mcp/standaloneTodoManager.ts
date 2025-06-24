// Standalone todo manager without VS Code dependencies
import { TodoItem, TodoStatus, TodoPriority, SubtaskStatus } from '../types';
import { TodoValidator } from '../todoValidator';
import { EventEmitter } from 'events';
import { ITodoStorage } from '../storage/ITodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { StandaloneCopilotWriter } from './standaloneCopilotWriter';

export class StandaloneTodoManager extends EventEmitter {
  private static instance: StandaloneTodoManager | null = null;
  private todos: TodoItem[] = [];
  private title: string = 'Todos';
  private storage: ITodoStorage;
  private storageDisposable: { dispose: () => void } | undefined;
  private lastUpdateHash: string = '';
  private updateVersion: number = 0;
  private copilotWriter: StandaloneCopilotWriter | null = null;
  
  constructor(storage?: ITodoStorage, autoInjectConfig?: { workspaceRoot: string; filePath?: string }) {
    super();
    this.storage = storage || new InMemoryStorage();
    if (autoInjectConfig) {
      this.copilotWriter = new StandaloneCopilotWriter(
        autoInjectConfig.workspaceRoot,
        autoInjectConfig.filePath
      );
    }
    this.initialize();
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
    
    // Subscribe to storage changes if supported
    if (this.storage.onDidChange) {
      this.storageDisposable = this.storage.onDidChange(() => {
        this.loadTodos();
      });
    }
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
      await this.storage.save(this.todos, this.title);
      
      // Also write to copilot instructions if enabled
      if (this.copilotWriter) {
        await this.copilotWriter.updateInstructionsWithTodos(this.todos, this.title);
      }
    } catch (error) {
      console.error('Failed to save todos:', error);
    }
  }
  
  getTodos(): TodoItem[] {
    return [...this.todos];
  }
  
  getTitle(): string {
    return this.title;
  }
  
  async setTitle(title: string): Promise<void> {
    this.title = title;
    this.saveTodos();
    this.fireChangeEvent();
  }
  
  async updateTodos(todos: TodoItem[], title?: string): Promise<void> {
    const validationResult = TodoValidator.validateTodos(todos);
    if (!validationResult.valid) {
      throw new Error(validationResult.errors.join(', '));
    }
    
    this.todos = todos;
    if (title !== undefined) {
      this.title = title;
    }
    this.saveTodos();
    this.fireChangeEvent();
  }
  
  // Alias for updateTodos to match VS Code TodoManager interface
  async setTodos(todos: TodoItem[], title?: string): Promise<void> {
    return this.updateTodos(todos, title);
  }
  
  async clearTodos(): Promise<void> {
    this.todos = [];
    this.saveTodos();
    
    // Remove from copilot instructions if enabled
    if (this.copilotWriter) {
      await this.copilotWriter.removeInstructionsTodos();
    }
    
    this.fireChangeEvent();
  }
  
  async deleteTodo(todoId: string): Promise<void> {
    this.todos = this.todos.filter(todo => todo.id !== todoId);
    this.saveTodos();
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
      this.saveTodos();
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
  
  async addSubtask(todoId: string, subtask: { id: string; content: string; status: SubtaskStatus }): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      if (!todo.subtasks) {
        todo.subtasks = [];
      }
      todo.subtasks.push(subtask);
      this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  async toggleSubtaskStatus(todoId: string, subtaskId: string): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    const subtask = todo?.subtasks?.find(s => s.id === subtaskId);
    if (subtask) {
      subtask.status = subtask.status === 'completed' ? 'pending' : 'completed';
      this.saveTodos();
      this.fireChangeEvent();
    }
  }
  
  async deleteSubtask(todoId: string, subtaskId: string): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo && todo.subtasks) {
      todo.subtasks = todo.subtasks.filter(s => s.id !== subtaskId);
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