// Standalone todo manager without VS Code dependencies
import { TodoItem, TodoStatus, TodoPriority, SubtaskStatus } from '../types';
import { TodoValidator } from '../todoValidator';
import { EventEmitter } from 'events';
import { ITodoStorage } from '../storage/ITodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';

export class StandaloneTodoManager extends EventEmitter {
  private static instance: StandaloneTodoManager | null = null;
  private todos: TodoItem[] = [];
  private title: string = 'Todos';
  private storage: ITodoStorage;
  private storageDisposable: { dispose: () => void } | undefined;
  private lastUpdateHash: string = '';
  
  constructor(storage?: ITodoStorage) {
    super();
    this.storage = storage || new InMemoryStorage();
    this.initialize();
  }
  
  static getInstance(storage?: ITodoStorage): StandaloneTodoManager {
    if (!StandaloneTodoManager.instance || storage) {
      StandaloneTodoManager.instance = new StandaloneTodoManager(storage);
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
    this.emit('todosChanged');
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
    this.emit('todosChanged');
  }
  
  async clearTodos(): Promise<void> {
    this.todos = [];
    this.saveTodos();
    this.emit('todosChanged');
  }
  
  async deleteTodo(todoId: string): Promise<void> {
    this.todos = this.todos.filter(todo => todo.id !== todoId);
    this.saveTodos();
    this.emit('todosChanged');
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
  
  async setTodoDetails(todoId: string, details: string | undefined): Promise<void> {
    const todo = this.todos.find(t => t.id === todoId);
    if (todo) {
      todo.details = details;
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
    const currentHash = JSON.stringify({ todos: this.todos, title: this.title });
    if (currentHash !== this.lastUpdateHash) {
      this.lastUpdateHash = currentHash;
      // Emit consolidated change event
      this.emit('change', { todos: this.getTodos(), title: this.getTitle() });
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
  
  
  dispose(): void {
    if (this.storageDisposable) {
      this.storageDisposable.dispose();
    }
    this.removeAllListeners();
  }
}