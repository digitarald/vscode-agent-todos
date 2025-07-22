import { TodoItem } from '../../types';
import { TodoValidator } from '../../todoValidator';
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
  getConfig(): any;
  getMcpServer(context?: ToolContext): any; // Returns the underlying MCP server instance for elicitation
}

interface TodoManagerLike {
  getTodos(): TodoItem[];
  getTitle(): string;
  getBaseTitle(): string;
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
    try {
      const tools = [];

      // Check if we're in standalone mode or if auto-inject is disabled
      const autoInject = this.isAutoInjectEnabled();
      const hasTodos = this.todoManager.getTodos().length > 0;

      // Only add todo_read if:
      // - In standalone mode (always show), OR
      // - Auto-inject is disabled AND there are todos to read
      if (this.server.isStandalone() || (!autoInject && hasTodos)) {
        const readDescription = `Use this tool to read the current to-do list for the session. This tool should be used proactively and frequently to ensure that you are aware of the status of the current task list.

<when-to-use>
You should make use of this tool as often as possible, especially in the following situations:
• At the beginning of conversations to see what's pending
• Before starting new tasks to prioritize work
• When the user asks about previous tasks or plans
• Whenever you're uncertain about what to do next
• After completing tasks to update your understanding of remaining work
• After every few messages to ensure you're on track
• When working on tasks that would benefit from a todo list
</when-to-use>

<persistence-reminder>
CRITICAL: Keep checking todos throughout the conversation. Do not assume you remember - always verify current state. You CANNOT maintain context between conversations without reading todos.
</persistence-reminder>

<instructions>
  <comprehensive-coverage>
  This tool tracks ALL work types:
  • Development (features, bugs, refactoring, optimization)
  • Research (analysis, exploration, investigation, learning)
  • Documentation (guides, API docs, specifications, tutorials)
  • Planning (architecture, roadmaps, strategies, workflows)
  • Reviews (code review, security audit, performance analysis)
  </comprehensive-coverage>

  <skip-conditions>
  Only skip when:
  • User explicitly says "start fresh" or "ignore previous todos"
  • You JUST updated todos (< 30 seconds ago)
  • Pure factual questions with zero task implications
  • Auto-inject is enabled (todos already in context)
  </skip-conditions>
</instructions>

<usage-notes>
• This tool takes no parameters - leave the input blank
• Returns a list of todo items with their status, priority, and content
• Use this information to track progress and plan next steps
• If no todos exist yet, an empty list will be returned
• When empty: Immediately use todo_write to plan the requested work
</usage-notes>

<response>
Returns JSON with title and todos array. Each todo includes id, content, status, priority, and adr.
</response>`;

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
      } else {
        console.log('[TodoTools] Skipping todo_read tool - auto-inject enabled or no todos');
      }

      // Always add todo_write
      const writeDescription = this.buildWriteDescription();

      tools.push({
        name: 'todo_write',
        description: writeDescription,
        inputSchema: this.getTodoWriteSchema(),
        annotations: {
          title: 'Update Todos',
          readOnlyHint: false
        }
      });
      console.log('[TodoTools] todo_write tool added');

      return tools;
    } catch (error) {
      console.error('[TodoTools] Error in getAvailableTools:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private buildWriteDescription(): string {
    const basePrompt = `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.

<when-to-use>
Use this tool proactively in these scenarios:
1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work
7. After completing a task - Mark it as completed and add any new follow-up tasks

Skip when:
• Single, straightforward task
• Task is trivial (< 3 steps)
• Purely conversational or informational
</when-to-use>

<persistence-reminder>
CRITICAL: Keep planning until the user's request is FULLY broken down. Do not stop at high-level tasks - decompose until each task is independently actionable (2-4 hour chunks).
</persistence-reminder>

<instructions>
  <threshold-rule>
  Use todos for ANY work requiring 3+ steps OR multiple contexts/files
  </threshold-rule>
  
  <task-categories>
  This tool tracks ALL work types:
  • Coding: features, bugs, refactoring, optimization, security
  • Research: codebase exploration, technology evaluation, root cause analysis
  • Documentation: API docs, guides, architecture docs, migration guides
  • Planning: system design, roadmaps, technical debt, process improvements
  • Learning: framework deep-dives, technology exploration, codebase onboarding
  </task-categories>

  <workflow-rules>
  ⚠️ PLAN FIRST: Never start work without todos for 3+ step tasks
  ⚠️ SINGLE PROGRESS: Only ONE task can be in_progress at any time
  ⚠️ IMMEDIATE UPDATES: Mark in_progress BEFORE starting, completed IMMEDIATELY when done
  ⚠️ COMPLETE FIRST: Finish current task before starting next
  ⚠️ DOCUMENT BLOCKERS: Keep tasks in_progress with ADR notes if blocked
  </workflow-rules>
  
  <status-transitions>
  • pending → in_progress: BEFORE starting work
  • in_progress → completed: IMMEDIATELY after finishing
  • Never leave tasks in_progress when switching
  </status-transitions>
</instructions>

<parameter-guidance>
  <todos>Complete array replacing entire todo list - include ALL existing incomplete todos</todos>
  <id>kebab-case verb-noun (e.g., "implement-auth", "fix-memory-leak")</id>
  <content>Specific, actionable description of what needs to be done</content>
  <status>pending/in_progress/completed - only ONE in_progress allowed</status>
  <priority>high (urgent/blocking), medium (important), low (nice-to-have)</priority>
  <adr>Architecture decisions, trade-offs, blockers, implementation notes</adr>`;

    const footer = `
</parameter-guidance>

<critical-warning>
⚠️ This tool REPLACES the entire todo list - always include existing todos you want to keep
⚠️ Use todo_read first if uncertain about current todos
⚠️ Never lose existing work by forgetting to include current todos in the update
</critical-warning>

<success-pattern>
1. Read current todos (if any exist)
2. Analyze task complexity (3+ steps = use todos)
3. Plan new work by adding/updating tasks
4. Mark appropriate task as in_progress before coding
5. Update progress as you work
6. Mark completed when finished
</success-pattern>

<best-practices>
• Front-load research and investigation tasks
• Make each task independently verifiable
• Document assumptions and decisions in ADR
• Keep task descriptions specific and measurable
</best-practices>`;

    return basePrompt + footer;
  }

  async handleToolCall(name: string, args: any, context?: ToolContext): Promise<ToolResult> {
    try {
      switch (name) {
        case 'todo_read':
          return await this.handleRead();
        case 'todo_write':
          return await this.handleWrite(args, context);
        default:
          console.warn(`[TodoTools] Unknown tool: ${name}`);
          return {
            content: [{
              type: 'text',
              text: `Unknown tool: ${name}`
            }],
            isError: true
          };
      }
    } catch (error) {
      console.error(`[TodoTools] Error in handleToolCall for ${name}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name,
        args: JSON.stringify(args, null, 2)
      });

      return {
        content: [{
          type: 'text',
          text: `Error in tool ${name}: ${error instanceof Error ? error.message : String(error)}`
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
    const title = this.todoManager.getBaseTitle();

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

    // Get current state before update for comparison
    const previousTodos = this.todoManager.getTodos();
    const previousTitle = this.todoManager.getTitle();

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
    }

    // Log the update operation
    console.log(`[TodoTools] Updating ${todos.length} todos: ${title || 'no title change'}`);

    // Mark this as an external change if we have a todoSync instance
    if (this.todoSync) {
      this.todoSync.markExternalChange();
    }

    if (title && previousTitle && previousTitle !== 'Todos' && title !== previousTitle) {
      console.log(`[TodoTools] Title change detected: "${previousTitle}" → "${title}"`);

      try {
        const mcpServer = this.server.getMcpServer(context);
        if (mcpServer && mcpServer.server && typeof mcpServer.server.elicitInput === 'function') {
          console.log('[TodoTools] Requesting user confirmation for title change via MCP elicitation');

          const elicitResult = await mcpServer.server.elicitInput({
            message: `Please confirm that you want to replace the current todo list "${previousTitle}" with "${title}".`,
            requestedSchema: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  title: "Action to take",
                  description: "How to handle the suggested list update",
                  enum: ["yes_archive", "reject"],
                  enumNames: ["Yes, archive current list", "Reject update, keep current list"]
                }
              },
              required: ["action"]
            }
          });

          if (elicitResult.action === "accept" && elicitResult.content) {
            const userChoice = elicitResult.content.action;
            console.log(`[TodoTools] User chose action: ${userChoice}`);

            switch (userChoice) {
              case "reject":
                // Reject the entire update - return early
                console.log(`[TodoTools] User rejected the todo update, cancelling operation`);
                return {
                  content: [{
                    type: 'text',
                    text: 'Todo update cancelled by user'
                  }]
                };
              default:
                console.log(`[TodoTools] Answered "${userChoice}", replacing list"`);
            }
          } else {
            // User cancelled or declined - reject the entire update
            console.log(`[TodoTools] User cancelled or declined todo update, cancelling operation`);
            return {
              content: [{
                type: 'text',
                text: 'Todo update cancelled by user'
              }]
            };
          }
        } else {
          console.log('[TodoTools] MCP server not available for elicitation, proceeding with update');
        }
      } catch (elicitError) {
        console.error('[TodoTools] Elicitation failed, proceeding with title change:', {
          error: elicitError instanceof Error ? elicitError.message : String(elicitError)
        });
      }
    }

    // Update todos with the final title
    await this.todoManager.updateTodos(todos, title);

    // Get state after update
    const finalTodos = this.todoManager.getTodos();
    const finalTitle = this.todoManager.getTitle();

    // Generate success message
    const pendingCount = todos.filter(t => t.status === 'pending').length;
    const inProgressTaskCount = todos.filter(t => t.status === 'in_progress').length;
    const completedCount = todos.filter(t => t.status === 'completed').length;

    let statusSummary = `(${pendingCount} pending, ${inProgressTaskCount} in progress, ${completedCount} completed)`;

    // Count todos with adr
    const todosWithAdr = todos.filter(t => t.adr);
    const adrInfo = todosWithAdr.length > 0 ? `\nADR added to ${todosWithAdr.length} task(s)` : '';

    const reminder = inProgressTaskCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';

    const autoInjectNote = this.isAutoInjectEnabled() && !this.server.isStandalone()
      ? '\nNote: Todos are automatically synced to <todos> in instructions file'
      : '';

    const titleMsg = title ? ` and title to "${title}"` : '';

    // Broadcast update via SSE
    this.server.broadcastUpdate({
      type: 'todos-updated',
      todos,
      title,
      timestamp: Date.now()
    });

    // Send smart completion notification
    try {
      if (context?.sendNotification && context._meta?.progressToken) {
        let notificationLabel = "";

        // Determine what changed
        const totalTodos = todos.length;
        const completedTodos = todos.filter(t => t.status === 'completed');
        const completedCount = completedTodos.length;

        // Check if this is initialization (no previous todos) or a complete list replacement
        const isNewList = previousTodos.length === 0 && todos.length > 0;
        const isTitleChange = title && title !== previousTitle;
        const isCompleteReplacement = todos.length > 0 && (
          isNewList ||
          isTitleChange ||
          // Check if this is a completely different set of todos (different IDs)
          (previousTodos.length > 0 && !todos.some(todo => previousTodos.some(prev => prev.id === todo.id)))
        );

        if (isCompleteReplacement) {
          notificationLabel = `Starting "${title || 'Todos'}" (${todos.length})`;
        }
        // Check if all todos are completed
        else if (completedCount === totalTodos && totalTodos > 0) {
          notificationLabel = `Completed "${title || 'untitled'}" (${todos.length})`;
        }
        else {
          // Create a map of previous todos by ID for quick lookup
          const previousTodoMap = new Map(previousTodos.map(t => [t.id, t]));
          const currentTodoMap = new Map(todos.map(t => [t.id, t]));

          // Detect various types of changes
          const newlyCompleted = todos.filter(todo => {
            const prevTodo = previousTodoMap.get(todo.id);
            const wasCompleted = prevTodo && prevTodo.status === 'completed';
            const isNowCompleted = todo.status === 'completed';
            return isNowCompleted && !wasCompleted;
          });

          const newlyInProgress = todos.filter(todo => {
            const prevTodo = previousTodoMap.get(todo.id);
            const wasInProgress = prevTodo && prevTodo.status === 'in_progress';
            const isNowInProgress = todo.status === 'in_progress';
            return isNowInProgress && !wasInProgress;
          });

          const statusChangedFromInProgress = previousTodos.filter(prevTodo => {
            const currentTodo = currentTodoMap.get(prevTodo.id);
            const wasInProgress = prevTodo.status === 'in_progress';
            const isStillInProgress = currentTodo && currentTodo.status === 'in_progress';
            return wasInProgress && !isStillInProgress;
          });

          const newTasks = todos.filter(todo => !previousTodoMap.has(todo.id));
          const deletedTasks = previousTodos.filter(prevTodo => !currentTodoMap.has(prevTodo.id));

          const priorityChanges = todos.filter(todo => {
            const prevTodo = previousTodoMap.get(todo.id);
            return prevTodo && prevTodo.priority !== todo.priority;
          });

          // Prioritize notifications by importance
          if (newlyCompleted.length > 0) {
            // Newly completed tasks (highest priority)
            const lastCompleted = newlyCompleted[newlyCompleted.length - 1];
            notificationLabel = `✅ (${completedCount}/${totalTodos}): ${lastCompleted.content}`;
          }
          else if (newlyInProgress.length > 0) {
            // Tasks starting work (high priority)
            const lastStarted = newlyInProgress[newlyInProgress.length - 1];
            notificationLabel = `🔄 Started: ${lastStarted.content}`;
          }
          else if (statusChangedFromInProgress.length > 0) {
            // Tasks no longer in progress (could be paused/reverted)
            const firstStopped = statusChangedFromInProgress[0];
            const currentTodo = currentTodoMap.get(firstStopped.id);
            const newStatus = currentTodo?.status || 'unknown';
            notificationLabel = `⏸️ Paused: ${firstStopped.content} (now ${newStatus})`;
          }
          else if (newTasks.length > 0) {
            // New tasks added
            if (newTasks.length === 1) {
              notificationLabel = `➕ Added: ${newTasks[0].content}`;
            } else {
              notificationLabel = `➕ Added ${newTasks.length} new tasks`;
            }
          }
          else if (deletedTasks.length > 0) {
            // Tasks removed
            if (deletedTasks.length === 1) {
              notificationLabel = `➖ Removed: ${deletedTasks[0].content}`;
            } else {
              notificationLabel = `➖ Removed ${deletedTasks.length} tasks`;
            }
          }
          else if (priorityChanges.length > 0) {
            // Priority changes (lowest priority notification)
            const firstPriorityChange = priorityChanges[0];
            const prevTodo = previousTodoMap.get(firstPriorityChange.id);
            notificationLabel = `🔄 Priority: ${firstPriorityChange.content} (${prevTodo?.priority} → ${firstPriorityChange.priority})`;
          }
        }

        // Only send notification if we have a meaningful message
        if (notificationLabel) {
          const notificationPayload = {
            method: "notifications/progress",
            params: {
              progressToken: context._meta.progressToken,
              progress: 1,
              total: 1,
              message: notificationLabel
            }
          };

          await context.sendNotification(notificationPayload);
          console.log(`[TodoTools] Sent notification: ${notificationLabel}`);
        }
      }
    } catch (notificationError) {
      console.error('[TodoTools] Notification error:', {
        error: notificationError instanceof Error ? notificationError.message : String(notificationError)
      });
    }

    return {
      content: [{
        type: 'text',
        text: `Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${adrInfo}${reminder}${autoInjectNote}`
      }]
    };
  }

  private getTodoWriteSchema(): any {
    const schema: any = {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'Complete array of all todos (this replaces the entire existing list)',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique kebab-case identifier for the task (e.g., "implement-user-auth")'
              },
              content: {
                type: 'string',
                minLength: 1,
                description: 'Clear, specific description of what needs to be done'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current state: pending (not started), in_progress (actively working), completed (finished). Only ONE task can be in_progress.'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Importance level: high (urgent/critical), medium (important), low (nice-to-have)'
              },
              adr: {
                type: 'string',
                description: 'Architecture Decision Record: technical context, rationale, implementation notes, or decisions made'
              }
            },
            required: ['id', 'content', 'status', 'priority']
          }
        },
        title: {
          type: 'string',
          description: 'Descriptive name for the entire todo list (e.g., project name, feature area, or sprint name)'
        }
      },
      required: ['todos']
    };

    return schema;
  }

  private isAutoInjectEnabled(): boolean {
    if (this.server.isStandalone()) {
      return false; // Always show tools in standalone mode
    }

    // Get autoInject from server configuration
    const config = this.server.getConfig();
    return config.autoInject || false;
  }

  // Public methods for testing
  public getAutoInjectEnabled(): boolean {
    return this.isAutoInjectEnabled();
  }
}