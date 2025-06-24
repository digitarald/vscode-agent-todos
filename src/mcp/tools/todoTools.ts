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
  private todoSync: any;

  constructor(
    private todoManager: TodoManagerLike,
    private server: MCPServerLike,
    todoSync?: any
  ) {
    this.todoSync = todoSync;
  }

  async getAvailableTools(): Promise<any[]> {
    const tools = [];

    // Check if we're in standalone mode or if auto-inject is disabled
    const autoInject = this.isAutoInjectEnabled();
    const subtasksEnabled = this.isSubtasksEnabled();

    // Only add todo_read if auto-inject is disabled
    if (!autoInject) {
      const readDescription = subtasksEnabled
        ? `Read the current task list including subtasks and implementation details to track progress and plan next steps.

IMPORTANT: Use PROACTIVELY and FREQUENTLY:
• At conversation start to see pending work
• Before starting new tasks to prioritize
• When user asks about previous tasks
• Whenever uncertain about next steps
• After completing tasks to update understanding
• Every few messages to stay on track

Returns all todos with status/priority/content plus any subtasks and implementation details.
Empty list if no todos exist yet.
Essential for maintaining context and avoiding duplicate work.`
        : `Read the current task list to track progress and plan next steps.

IMPORTANT: Use PROACTIVELY and FREQUENTLY:
• At conversation start to see pending work
• Before starting new tasks to prioritize
• When user asks about previous tasks
• Whenever uncertain about next steps
• After completing tasks to update understanding
• Every few messages to stay on track

Returns all todos with status/priority/content.
Empty list if no todos exist yet.
Essential for maintaining context and avoiding duplicate work.`;

      tools.push({
        name: 'todo_read',
        description: readDescription,
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
    const writeDescription = subtasksEnabled
      ? `Creates and manages a structured task list with subtasks for tracking progress and organizing work.

USE PROACTIVELY FOR:
• Complex multi-step tasks (3+ steps)
• Non-trivial tasks requiring planning
• Multiple user requests
• Capturing new instructions
• Marking tasks in_progress BEFORE starting work
• Marking completed IMMEDIATELY after finishing, optionally adding implementation notes

SKIP FOR:
• Single straightforward tasks
• Trivial operations (<3 steps)
• Purely conversational requests

RULES:
• Only ONE task can be in_progress at a time
• Update status in real-time
• Complete current tasks before starting new ones
• Break complex tasks into specific actionable items

REQUIRED FIELDS:
• id: short unique identifier
• content: clear action (min 1 char)
• status: pending/in_progress/completed
• priority: high/medium/low
• adr (optional): context, decision log and/or implementation notes

SUBTASKS:
• Break down complex tasks into manageable subtasks
• Each subtask needs: id, content, status (pending/completed)

Note: This replaces the entire list, so include all existing todos to keep.`
      : `Creates and manages a structured task list for tracking progress and organizing work.

USE PROACTIVELY FOR:
• Complex multi-step tasks (3+ steps)
• Non-trivial tasks requiring planning
• Multiple user requests
• Capturing new instructions
• Marking tasks in_progress BEFORE starting work
• Marking completed IMMEDIATELY after finishing, optionally adding implementation notes

SKIP FOR:
• Single straightforward tasks
• Trivial operations (<3 steps)
• Purely conversational requests

RULES:
• Only ONE task can be in_progress at a time
• Update status in real-time
• Complete current tasks before starting new ones
• Break complex tasks into specific actionable items

FIELDS:
• id: short unique identifier
• content: clear action (min 1 char)
• status: pending/in_progress/completed
• priority: high/medium/low
• adr (optional): context, decision log and/or implementation notes

Note: This replaces the entire list, so include all existing todos to keep.`;

    tools.push({
      name: 'todo_write',
      description: writeDescription,
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
    const previousTitle = this.todoManager.getTitle();
    
    console.log('[TodoTools.handleWrite] State before update:', {
      previousTodoCount: previousTodos.length,
      previousTitle: previousTitle,
      newTodoCount: todos.length,
      newTitle: title || 'no change',
      todoSync: !!this.todoSync,
      server: this.server.isStandalone() ? 'standalone' : 'vscode'
    });

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
            text: 'Error: Subtasks are disabled in settings. Enable agentTodos.enableSubtasks to use subtasks.'
          }],
          isError: true
        };
      }
    }

    // Log the update operation
    console.log(`[TodoTools] Updating todos via MCP: ${todos.length} items, title: ${title || 'no change'}`);

    // Mark this as an external change if we have a todoSync instance
    if (this.todoSync) {
      console.log('[TodoTools] Marking change as external (MCP-initiated)');
      this.todoSync.markExternalChange();
    }

    // Update todos
    await this.todoManager.updateTodos(todos, title);

    // Get state after update
    const finalTodos = this.todoManager.getTodos();
    const finalTitle = this.todoManager.getTitle();
    
    console.log('[TodoTools.handleWrite] State after update:', {
      finalTodoCount: finalTodos.length,
      finalTitle: finalTitle,
      todosSaved: finalTodos.length === todos.length,
      titleSaved: title === undefined || finalTitle === title
    });

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

    // Count todos with adr
    const todosWithAdr = todos.filter(t => t.adr);
    const adrInfo = todosWithAdr.length > 0 ? `\nADR added to ${todosWithAdr.length} task(s)` : '';

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
        text: `Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${subtaskInfo}${adrInfo}${reminder}${autoInjectNote}`
      }]
    };
  }

  private getTodoWriteSchema(subtasksEnabled: boolean): any {
    const schema: any = {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Complete list of todos (replaces existing list)',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier'
              },
              content: {
                type: 'string',
                minLength: 1,
                description: 'Clear, actionable task description'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Task state (only ONE in_progress allowed)'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Urgency level'
              }
            },
            required: ['id', 'content', 'status', 'priority']
          }
        },
        title: {
          type: 'string',
          description: 'Optional list title (e.g., project name)'
        }
      },
      required: ['todos']
    };

    // Add subtasks and details if enabled
    if (subtasksEnabled) {
      schema.properties.todos.items.properties.subtasks = {
        type: 'array',
        description: 'Break down complex tasks into smaller steps',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique subtask ID'
            },
            content: {
              type: 'string',
              minLength: 1,
              description: 'Subtask description'
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed'],
              description: 'Completion state'
            }
          },
          required: ['id', 'content', 'status']
        }
      };

      schema.properties.todos.items.properties.adr = {
        type: 'string',
        description: 'Architecture decisions, rationale, or implementation notes'
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