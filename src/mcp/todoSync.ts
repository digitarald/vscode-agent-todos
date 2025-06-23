// Sync mechanism between VS Code TodoManager and Standalone TodoManager
import { TodoItem } from '../types';

export class TodoSync {
  private vscodeManager: any;
  private standaloneManager: any;
  private syncDisposable: any;
  private isSyncing: boolean = false;
  
  constructor(vscodeManager: any, standaloneManager: any) {
    this.vscodeManager = vscodeManager;
    this.standaloneManager = standaloneManager;
    
    // Initial sync from VS Code to standalone
    this.syncToStandalone();
    
    // Setup bidirectional sync
    this.setupSync();
  }
  
  private syncToStandalone(): void {
    if (this.isSyncing) {
      return; // Prevent circular sync
    }
    
    this.isSyncing = true;
    try {
      const todos = this.vscodeManager.getTodos();
      const title = this.vscodeManager.getTitle();
      this.standaloneManager.updateTodos(todos, title);
    } finally {
      // Reset flag after a short delay to ensure all cascading updates are complete
      setTimeout(() => {
        this.isSyncing = false;
      }, 100);
    }
  }
  
  private syncToVSCode(): void {
    if (this.isSyncing) {
      return; // Prevent circular sync
    }
    
    this.isSyncing = true;
    try {
      const todos = this.standaloneManager.getTodos();
      const title = this.standaloneManager.getTitle();
      this.vscodeManager.setTodos(todos, title);
    } finally {
      // Reset flag after a short delay to ensure all cascading updates are complete
      setTimeout(() => {
        this.isSyncing = false;
      }, 100);
    }
  }
  
  private setupSync(): void {
    // Sync from VS Code to standalone
    this.syncDisposable = this.vscodeManager.onDidChangeTodos(() => {
      this.syncToStandalone();
    });
    
    // Sync from standalone to VS Code
    this.standaloneManager.on('todosChanged', () => {
      this.syncToVSCode();
    });
  }
  
  dispose(): void {
    if (this.syncDisposable) {
      this.syncDisposable.dispose();
    }
    this.standaloneManager.removeAllListeners();
  }
}