import { TodoItem } from '../../types';
import { TodoValidator } from '../../todoValidator';
import { SubtaskManager } from '../../subtaskManager';
import { ToolResult } from '../types';

interface TodoWriteParams {
  todos: TodoItem[];
  title?: string;
}

interface ToolContext {
  sendNotification?: (notification: any) => Promise<void>;
  _meta?: {
    progressToken?: string;
  };
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
  onDidChange(callback: (change: { todos: TodoItem[], title: string }) => void): { dispose: () => void };
}

export class TodoTools {
  constructor(
    private todoManager: TodoManagerLike,
    private server: MCPServerLike
  ) { }

  async getAvailableTools(): Promise<any[]> {
    const tools = [];

    // Check if we're in standalone mode or if auto-inject is disabled
    const autoInject = this.isAutoInjectEnabled();
    const subtasksEnabled = this.isSubtasksEnabled();

    // Only add todo_read if auto-inject is disabled
    if (!autoInject) {
      tools.push({
        name: 'todo_read',
        description: 'Read the current task list including subtasks and implementation details to track progress and plan next steps. IMPORTANT: Use PROACTIVELY and FREQUENTLY: at conversation start to see pending work, before starting new tasks to prioritize, when user asks about previous tasks, whenever uncertain about next steps, after completing tasks to update understanding, every few messages to stay on track. Returns all todos with status/priority/content plus any subtasks (when enabled) and implementation details. Empty list if no todos exist yet. Essential for maintaining context and avoiding duplicate work.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        annotations: {
          title: 'Check Todos',
          readOnlyHint: true
        }
      });
    }

    // Always add todo_write
    tools.push({
      name: 'todo_write',
      description: 'Creates and manages a structured task list with optional subtasks for tracking progress and organizing work. Use PROACTIVELY for: complex multi-step tasks (3+ steps), non-trivial tasks requiring planning, multiple user requests, capturing new instructions, marking tasks in_progress BEFORE starting work, and marking completed IMMEDIATELY after finishing. SKIP for: single straightforward tasks, trivial operations (<3 steps), purely conversational requests. RULES: Only ONE task can be in_progress at a time, update status in real-time, complete current tasks before starting new ones, break complex tasks into specific actionable items. Each todo requires: id (unique), content (clear action, min 1 char), status (pending/in_progress/completed), priority (high/medium/low). SUBTASKS (when enabled): Granular Tasks - Break down complex tasks into manageable subtasks; Clear Dependencies - Define subtask dependencies to show implementation order; Implementation Notes - Use details field to track progress and decisions; Status Tracking - Keep subtask status updated as work progresses. Each subtask requires: id, content, status (pending/completed). This replaces the entire list, so include all existing todos to keep.',
      inputSchema: this.getTodoWriteSchema(subtasksEnabled),
      annotations: {
        title: 'Update Todos'
      }
    });

    return tools;
  }

  async handleToolCall(name: string, args: any, context?: ToolContext): Promise<ToolResult> {
    switch (name) {
      case 'todo_read':
        return await this.handleRead();
      case 'todo_write':
        return await this.handleWrite(args, context);
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
      console.log('[TodoTools] Read blocked - auto-inject is enabled');
      return {
        content: [{
          type: 'text',
          text: 'Todo list is automatically available in custom instructions when auto-inject is enabled. This tool is disabled.'
        }]
      };
    }

    const todos = this.todoManager.getTodos();
    const title = this.todoManager.getTitle();
    console.log(`[TodoTools] Reading todos: ${todos.length} items, title: "${title}"`);
    
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

  private async handleWrite(params: TodoWriteParams, context?: ToolContext): Promise<ToolResult> {
    const { todos, title } = params;

    // Debug logging for context
    console.log('[TodoTools.handleWrite] Context received:', {
      hasContext: !!context,
      hasSendNotification: !!context?.sendNotification,
      sendNotificationType: typeof context?.sendNotification,
      hasMeta: !!context?._meta,
      hasProgressToken: !!context?._meta?.progressToken,
      progressToken: context?._meta?.progressToken,
      contextKeys: context ? Object.keys(context) : [],
      metaKeys: context?._meta ? Object.keys(context._meta) : [],
      fullContext: JSON.stringify(context, null, 2)
    });

    // Get current state before update for comparison
    const previousTodos = this.todoManager.getTodos();

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

    // Log the update operation
    console.log(`[TodoTools] Updating todos via MCP: ${todos.length} items, title: ${title || 'no change'}`);
    
    // Update todos
    await this.todoManager.updateTodos(todos, title);
    
    console.log('[TodoTools] Update completed, todos should sync to VS Code');

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
    console.log('[TodoTools] Broadcasting update event');
    this.server.broadcastUpdate({
      type: 'todos-updated',
      todos,
      title,
      timestamp: Date.now()
    });

    // Send smart completion notification
    console.log('[TodoTools.handleWrite] Checking notification conditions:', {
      hasSendNotification: !!context?.sendNotification,
      hasProgressToken: !!context?._meta?.progressToken,
      willSendNotification: !!(context?.sendNotification && context._meta?.progressToken)
    });

    try {
      if (context?.sendNotification && context._meta?.progressToken) {
        console.log('[TodoTools.handleWrite] Preparing to send notification');
        console.log('[TodoTools.handleWrite] previousTodos:', previousTodos);
        let notificationLabel = "";

        // Determine what changed
        const totalTodos = todos.length;
        const completedTodos = todos.filter(t => t.status === 'completed');
        const completedCount = completedTodos.length;

        console.log('[TodoTools.handleWrite] Change detection:', {
          previousTodosLength: previousTodos.length,
          newTodosLength: todos.length,
          completedCount,
          totalTodos,
          title
        });

        // Check if this is initialization (no previous todos)
        if (previousTodos.length === 0 && todos.length > 0) {
          notificationLabel = `Initialized todos for ${title || 'untitled'}`;
          console.log('[TodoTools.handleWrite] Initialization case detected:', notificationLabel);
        }
        // Check if all todos are completed
        else if (completedCount === totalTodos && totalTodos > 0) {
          notificationLabel = `Completed all todos for ${title || 'untitled'}`;
          console.log('[TodoTools.handleWrite] All completed case detected:', notificationLabel);
        }
        // Find newly completed tasks by comparing with previous state
        else {
          console.log('[TodoTools.handleWrite] Checking for newly completed tasks');
          // Create a map of previous todos by ID for quick lookup
          const previousTodoMap = new Map(previousTodos.map(t => [t.id, t]));

          // Find tasks that were just completed (not completed before, completed now)
          const newlyCompleted = todos.filter(todo => {
            const prevTodo = previousTodoMap.get(todo.id);
            return todo.status === 'completed' &&
              prevTodo &&
              prevTodo.status !== 'completed';
          });

          console.log('[TodoTools.handleWrite] Newly completed tasks:', newlyCompleted.length);

          if (newlyCompleted.length > 0) {
            // Get the most recently completed task
            const lastCompleted = newlyCompleted[newlyCompleted.length - 1];
            notificationLabel = `Completed (${completedCount}/${totalTodos}): ${lastCompleted.content}`;
            console.log('[TodoTools.handleWrite] Newly completed case detected:', notificationLabel);
          } else {
            console.log('[TodoTools.handleWrite] No newly completed tasks found');
          }
        }

        // Only send notification if we have a meaningful message
        if (notificationLabel) {
          console.log('[TodoTools.handleWrite] Sending notification:', {
            notificationLabel,
            progressToken: context._meta.progressToken
          });

          try {
            const notificationPayload = {
              method: "notifications/progress",
              params: {
                progress: 1,
                progressToken: context._meta.progressToken,
                message: notificationLabel
              }
            };

            console.log('[TodoTools.handleWrite] Notification payload:', JSON.stringify(notificationPayload, null, 2));

            await context.sendNotification(notificationPayload);

            console.log('[TodoTools.handleWrite] Notification sent successfully');
          } catch (error) {
            // Log error but don't throw - notifications are optional
            console.error('[TodoTools.handleWrite] Failed to send notification:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
          }
        } else {
          console.log('[TodoTools.handleWrite] No notification label generated, skipping notification');
        }
      }
    } catch (notificationError) {
      console.error('[TodoTools.handleWrite] Error in notification handling:', {
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        stack: notificationError instanceof Error ? notificationError.stack : undefined
      });
    }

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
                description: 'Unique identifier string'
              },
              content: {
                type: 'string',
                minLength: 1,
                description: 'Clear, actionable description of what needs to be done'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current state of the task (only ONE task should be in_progress at a time)'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Task urgency: high (critical/blocking), medium (important), low (nice-to-have)'
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
        description: 'Optional subtasks for breaking down complex tasks',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for subtask'
            },
            content: {
              type: 'string',
              minLength: 1,
              description: 'Subtask description'
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed'],
              description: 'Subtask completion status'
            }
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
      return vscode.workspace.getConfiguration('agentTodos').get('autoInject', false);
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
      return vscode.workspace.getConfiguration('agentTodos').get('enableSubtasks', true);
    } catch (error) {
      return true; // Default to true if vscode not available
    }
  }
}