import { TodoItem } from '../../types';
import { TodoValidator } from '../../todoValidator';
import { SubtaskManager } from '../../subtaskManager';
import { ToolResult } from '../types';

interface TodoWriteParams {
  todos: TodoItem[];
  title?: string;
}

interface MCPServerLike {
  isStandalone(): boolean;
  broadcastUpdate(event: any): void;
}

interface TodoManagerLike {
  getTodos(): TodoItem[];
  getTitle(): string;
  updateTodos(todos: TodoItem[], title?: string): Promise<void>;
  setTitle(title: string): Promise<void>;
  onDidChangeTodos(callback: () => void): { dispose: () => void };
}

export class TodoTools {
  constructor(
    private todoManager: TodoManagerLike,
    private server: MCPServerLike
  ) {}

  async getAvailableTools(): Promise<any[]> {
    const tools = [];
    
    // Check if we're in standalone mode or if auto-inject is disabled
    const autoInject = this.isAutoInjectEnabled();
    const subtasksEnabled = this.isSubtasksEnabled();
    
    // Only add todo_read if auto-inject is disabled
    if (!autoInject) {
      tools.push({
        name: 'todo_read',
        description: 'Read the current task list including subtasks and implementation details',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      });
    }
    
    // Always add todo_write
    tools.push({
      name: 'todo_write',
      description: 'Write/update the task list with optional subtasks',
      inputSchema: this.getTodoWriteSchema(subtasksEnabled)
    });
    
    return tools;
  }

  async handleToolCall(name: string, args: any): Promise<ToolResult> {
    switch (name) {
      case 'todo_read':
        return await this.handleRead();
      case 'todo_write':
        return await this.handleWrite(args);
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  }

  private async handleRead(): Promise<ToolResult> {
    // Check if auto-inject is enabled
    const autoInject = this.isAutoInjectEnabled();
    
    if (autoInject && !this.server.isStandalone()) {
      return {
        content: [{
          type: 'text',
          text: 'Todo list is automatically available in custom instructions when auto-inject is enabled. This tool is disabled.'
        }]
      };
    }
    
    const todos = this.todoManager.getTodos();
    const title = this.todoManager.getTitle();
    const result = {
      title,
      todos
    };
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  private async handleWrite(params: TodoWriteParams): Promise<ToolResult> {
    const { todos, title } = params;
    
    // Validate input
    if (!Array.isArray(todos)) {
      return {
        content: [{
          type: 'text',
          text: 'Error: todos must be an array'
        }],
        isError: true
      };
    }
    
    // Check for multiple in_progress tasks
    const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      return {
        content: [{
          type: 'text',
          text: `Error: Only ONE task can be in_progress at a time. Found ${inProgressCount} tasks marked as in_progress. Please complete current tasks before starting new ones.`
        }],
        isError: true
      };
    }
    
    // Check if subtasks are enabled
    const subtasksEnabled = this.isSubtasksEnabled();
    
    // Validate each todo
    for (const todo of todos) {
      const validation = TodoValidator.validateTodo(todo);
      if (!validation.valid) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${validation.error}`
          }],
          isError: true
        };
      }
      
      // Check if subtasks are disabled but todo has subtasks
      if (todo.subtasks && !subtasksEnabled && !this.server.isStandalone()) {
        return {
          content: [{
            type: 'text',
            text: 'Error: Subtasks are disabled in settings. Enable todoManager.enableSubtasks to use subtasks.'
          }],
          isError: true
        };
      }
    }
    
    // Update todos
    await this.todoManager.updateTodos(todos, title);
    
    // Generate success message
    const pendingCount = todos.filter(t => t.status === 'pending').length;
    const inProgressTaskCount = todos.filter(t => t.status === 'in_progress').length;
    const completedCount = todos.filter(t => t.status === 'completed').length;
    
    let statusSummary = `(${pendingCount} pending, ${inProgressTaskCount} in progress, ${completedCount} completed)`;
    
    // Count subtasks if enabled
    let subtaskInfo = '';
    if (subtasksEnabled) {
      const todosWithSubtasks = todos.filter(t => t.subtasks && t.subtasks.length > 0);
      if (todosWithSubtasks.length > 0) {
        let totalSubtasks = 0;
        let completedSubtasks = 0;
        
        for (const todo of todosWithSubtasks) {
          const counts = SubtaskManager.countCompletedSubtasks(todo);
          totalSubtasks += counts.total;
          completedSubtasks += counts.completed;
        }
        
        subtaskInfo = `\nSubtasks: ${completedSubtasks}/${totalSubtasks} completed across ${todosWithSubtasks.length} tasks`;
      }
    }
    
    // Count todos with details
    const todosWithDetails = todos.filter(t => t.details);
    const detailsInfo = todosWithDetails.length > 0 ? `\nDetails added to ${todosWithDetails.length} task(s)` : '';
    
    const reminder = inProgressTaskCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';
    
    const autoInjectNote = this.isAutoInjectEnabled() && !this.server.isStandalone() 
      ? '\nNote: Todos are automatically synced to <todos> in .github/copilot-instructions.md' 
      : '';
    
    const titleMsg = title ? ` and title to "${title}"` : '';
    
    // Broadcast update via SSE
    this.server.broadcastUpdate({
      type: 'todos-updated',
      todos,
      title,
      timestamp: Date.now()
    });
    
    return {
      content: [{
        type: 'text',
        text: `Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${subtaskInfo}${detailsInfo}${reminder}${autoInjectNote}`
      }]
    };
  }

  private getTodoWriteSchema(subtasksEnabled: boolean): any {
    const schema: any = {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the todo'
              },
              content: {
                type: 'string',
                minLength: 1,
                description: 'Description of the task'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of the task'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Priority level of the task'
              }
            },
            required: ['id', 'content', 'status', 'priority']
          }
        },
        title: {
          type: 'string',
          description: 'Optional title for the todo list'
        }
      },
      required: ['todos']
    };
    
    // Add subtasks and details if enabled
    if (subtasksEnabled) {
      schema.properties.todos.items.properties.subtasks = {
        type: 'array',
        description: 'Optional subtasks',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['pending', 'completed'] }
          },
          required: ['id', 'content', 'status']
        }
      };
      
      schema.properties.todos.items.properties.details = {
        type: 'string',
        description: 'Optional implementation details or notes'
      };
    }
    
    return schema;
  }

  private isAutoInjectEnabled(): boolean {
    if (this.server.isStandalone()) {
      return false; // Always show tools in standalone mode
    }
    
    try {
      const vscode = require('vscode');
      return vscode.workspace.getConfiguration('todoManager').get('autoInject', false);
    } catch (error) {
      return false; // Default to false if vscode not available
    }
  }

  private isSubtasksEnabled(): boolean {
    if (this.server.isStandalone()) {
      return true; // Always enable subtasks in standalone mode
    }
    
    try {
      const vscode = require('vscode');
      return vscode.workspace.getConfiguration('todoManager').get('enableSubtasks', true);
    } catch (error) {
      return true; // Default to true if vscode not available
    }
  }
}