// HTTP MCP server implementation using high-level McpServer with dynamic tool discovery
import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { MCPServerConfig } from './types';
import { StandaloneTodoManager } from './standaloneTodoManager';
import { ITodoStorage } from '../storage/ITodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';
import { TodoValidator } from '../todoValidator';
import { SubtaskManager } from '../subtaskManager';

// Dynamic imports for ESM modules
let McpServer: any;
let ResourceTemplate: any;
let StreamableHTTPServerTransport: any;
let isInitializeRequest: any;
let z: any;

export class TodoMCPServer {
  private app: Express;
  private httpServer: HTTPServer | null = null;
  private todoManager: StandaloneTodoManager | any;
  private config: MCPServerConfig;
  private isRunning: boolean = false;
  private transports: Map<string, any> = new Map();
  private mcpServers: Map<string, any> = new Map();
  private todoSync: any = null;
  private resourceSubscriptions: Map<string, Set<string>> = new Map(); // sessionId -> resource URIs
  private readonly loggerName = 'TodoMCPServer';

  // Dynamic tool management - track tools by ID for each session
  private sessionTools: Map<string, { todoReadTool: any; todoWriteTool: any }> = new Map();

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      port: config.port || 3000,
      workspaceRoot: config.workspaceRoot || process.cwd(),
      standalone: config.standalone === true,
      autoInject: config.autoInject || false,
      enableSubtasks: config.enableSubtasks !== undefined ? config.enableSubtasks : true,
      autoInjectFilePath: config.autoInjectFilePath || '.github/copilot-instructions.md'
    };

    // Initialize todo manager based on mode
    if (this.config.standalone) {
      // Always use InMemoryStorage for standalone mode
      const storage = new InMemoryStorage();
      const autoInjectConfig = this.config.autoInject && this.config.workspaceRoot ? {
        workspaceRoot: this.config.workspaceRoot,
        filePath: this.config.autoInjectFilePath
      } : undefined;
      this.todoManager = StandaloneTodoManager.getInstance(storage, autoInjectConfig);
    } else {
      // In VS Code mode, the manager will be set via setTodoManager
      this.todoManager = null;
    }

    // Setup Express app
    this.app = express();

    // Configure body parsing middleware with proper options
    this.app.use(express.json({ type: 'application/json' }));
    this.app.use(express.text({ type: 'text/plain' }));
    this.app.use(express.raw({ type: 'application/octet-stream' }));

    // Setup basic routes immediately
    this.setupBasicRoutes();
  }

  async initialize(): Promise<void> {
    // Dynamic import for ESM modules - updated for SDK 1.15.0+
    const mcpModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const httpModule = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const typesModule = await import('@modelcontextprotocol/sdk/types.js');
    const zodModule = await import('zod');

    McpServer = mcpModule.McpServer;
    ResourceTemplate = mcpModule.ResourceTemplate;
    StreamableHTTPServerTransport = httpModule.StreamableHTTPServerTransport;
    isInitializeRequest = typesModule.isInitializeRequest;
    z = zodModule.z;

    // Setup routes after initialization
    this.setupRoutes();
  }

  private setupBasicRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        version: '1.0.0',
        sessions: this.transports.size,
        uptime: process.uptime(),
        standalone: this.config.standalone
      });
    });
  }

  private setupRoutes(): void {
    // Handle POST requests for client-to-server communication
    this.app.post('/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport = sessionId ? this.transports.get(sessionId) : undefined;
        let server = sessionId ? this.mcpServers.get(sessionId) : undefined;

        // If no existing session and this is an initialize request, create new session
        if (!transport && isInitializeRequest(req.body)) {
          const newSessionId = randomUUID();

          // Create transport with session
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessioninitialized: async (sessionId: string) => {
              // Send initialization complete log message
              console.log(`[TodoMCPServer] Session initialized: ${sessionId}`);
              this.transports.set(sessionId, transport);
            }
          });

          // Clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              this.cleanupSession(transport.sessionId);
            }
          };

          // Create MCP server with high-level API
          server = new McpServer({
            name: 'todos-mcp-server',
            version: '1.0.0'
          });

          // Store server
          this.mcpServers.set(newSessionId, server);

          // Register initial tools and resources BEFORE connecting
          await this.registerToolsAndResources(server, newSessionId);

          // Connect server to transport
          await server.connect(transport);

          console.log(`[TodoMCPServer] Created new MCP session: ${newSessionId}`);
        }

        if (!transport) {
          res.status(400).json({
            error: 'No session found. Send initialize request first.'
          });
          return;
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('[TodoMCPServer] Error handling MCP request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports.get(sessionId)) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    this.app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    this.app.delete('/mcp', handleSessionRequest);
  }

  private async registerToolsAndResources(server: any, sessionId: string): Promise<void> {
    if (!this.todoManager) {
      console.warn('[TodoMCPServer] No todo manager available during tool registration');
      return;
    }

    // Create session tool tracking
    const sessionTools = { todoReadTool: null, todoWriteTool: null };
    this.sessionTools.set(sessionId, sessionTools);

    // Check current state for initial tool registration
    this.updateToolsForSession(server, sessionId);

    // Register resources
    server.registerResource(
      "todos-markdown",
      new ResourceTemplate("todos://todos", { list: undefined }),
      {
        title: "Todo List",
        description: "Current todo list in markdown format",
        mimeType: "text/markdown"
      },
      async (uri: any) => {
        // Get current todos
        const todos = this.todoManager.getTodos();
        const title = this.todoManager.getBaseTitle();

        // Format as markdown
        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, title, true);

        return {
          contents: [{
            uri: uri.href,
            mimeType: "text/markdown",
            text: markdown
          }]
        };
      }
    );
  }

  private updateToolsForSession(server: any, sessionId: string): void {
    const sessionTools = this.sessionTools.get(sessionId);
    if (!sessionTools) {
      return;
    }

    // Check if we should show todo_read tool
    const autoInject = this.isAutoInjectEnabled();
    const subtasksEnabled = this.isSubtasksEnabled();
    const hasTodos = this.todoManager.getTodos().length > 0;
    const shouldShowTodoRead = this.config.standalone || (!autoInject && hasTodos);

    // Handle todo_read tool
    if (shouldShowTodoRead && !sessionTools.todoReadTool) {
      // Add todo_read tool using modern registerTool API with proper descriptions
      sessionTools.todoReadTool = server.registerTool(
        "todo_read",
        {
          title: "Check Todos",
          description: this.buildReadDescription(subtasksEnabled),
          inputSchema: this.getEmptyZodSchema() // Proper Zod schema for no parameters
        },
        async () => await this.handleRead()
      );
      console.log(`[TodoMCPServer] Added todo_read tool for session ${sessionId}`);
    } else if (!shouldShowTodoRead && sessionTools.todoReadTool) {
      // Remove todo_read tool
      sessionTools.todoReadTool.remove();
      sessionTools.todoReadTool = null;
      console.log(`[TodoMCPServer] Removed todo_read tool for session ${sessionId}`);
    }

    // Handle todo_write tool (always present but schema may change)
    if (!sessionTools.todoWriteTool) {
      sessionTools.todoWriteTool = server.registerTool(
        "todo_write",
        {
          title: "Update Todos",
          description: this.buildWriteDescription(subtasksEnabled),
          inputSchema: this.getTodoWriteZodSchema(subtasksEnabled)
        },
        async (args: any, context: any) => await this.handleWrite(args, context)
      );
    } else {
      // Update existing tool schema
      sessionTools.todoWriteTool.update({
        title: "Update Todos",
        description: this.buildWriteDescription(subtasksEnabled),
        inputSchema: this.getTodoWriteZodSchema(subtasksEnabled)
      });
    }
  }

  private buildReadDescription(subtasksEnabled: boolean): string {
    const baseDescription = `Use this tool to read the current to-do list for the session. This tool should be used proactively and frequently to ensure that you are aware of the status of the current task list.

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
Returns JSON with title and todos array. Each todo includes id, content, status, priority, adr`;

    if (subtasksEnabled) {
      return baseDescription + ', and subtasks (if enabled).';
    }
    return baseDescription + '.';
  }

  private buildWriteDescription(subtasksEnabled: boolean): string {
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

    const subtasksSection = subtasksEnabled ? `
  <subtasks>Break complex tasks into smaller steps - use for tasks with 3+ phases</subtasks>` : '';

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
• Use subtasks for multi-day efforts
• Document assumptions and decisions in ADR
• Keep task descriptions specific and measurable
</best-practices>`;

    return basePrompt + subtasksSection + footer;
  }

  private getTodoWriteSchema(subtasksEnabled: boolean): any {
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

    // Add subtasks if enabled
    if (subtasksEnabled) {
      schema.properties.todos.items.properties.subtasks = {
        type: 'array',
        description: 'Break complex tasks into smaller, manageable steps. Use for any task with 3+ actions.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique kebab-case identifier for this subtask'
            },
            content: {
              type: 'string',
              minLength: 1,
              description: 'Specific action or step to complete'
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed'],
              description: 'Completion state: pending (not done) or completed (finished)'
            }
          },
          required: ['id', 'content', 'status']
        }
      };
    }

    return schema;
  }

  private getEmptyZodSchema(): any {
    if (!z) {
      throw new Error('Zod not initialized. Call initialize() first.');
    }
    return z.object({});
  }

  private getEmptyJsonSchema(): any {
    return {
      type: 'object',
      properties: {},
      required: []
    };
  }

  private getTodoWriteZodSchema(subtasksEnabled: boolean): any {
    if (!z) {
      throw new Error('Zod not initialized. Call initialize() first.');
    }

    // Base todo schema
    const todoSchema = z.object({
      id: z.string().describe('Unique kebab-case identifier for the task (e.g., "implement-user-auth")'),
      content: z.string().min(1).describe('Clear, specific description of what needs to be done'),
      status: z.enum(['pending', 'in_progress', 'completed']).describe('Current state: pending (not started), in_progress (actively working), completed (finished). Only ONE task can be in_progress.'),
      priority: z.enum(['low', 'medium', 'high']).describe('Importance level: high (urgent/critical), medium (important), low (nice-to-have)'),
      adr: z.string().optional().describe('Architecture Decision Record: technical context, rationale, implementation notes, or decisions made')
    });

    // Conditionally add subtasks if enabled
    if (subtasksEnabled) {
      const subtaskSchema = z.object({
        id: z.string().describe('Unique kebab-case identifier for this subtask'),
        content: z.string().min(1).describe('Specific action or step to complete'),
        status: z.enum(['pending', 'completed']).describe('Completion state: pending (not done) or completed (finished)')
      });

      // Return a single Zod schema object with subtasks support
      return z.object({
        todos: z.array(todoSchema.extend({
          subtasks: z.array(subtaskSchema).optional().describe('Break complex tasks into smaller, manageable steps. Use for any task with 3+ actions.')
        })).describe('Complete array of all todos (this replaces the entire existing list)'),
        title: z.string().optional().describe('Descriptive name for the entire todo list (e.g., project name, feature area, or sprint name)')
      });
    }

    // Return a single Zod schema object without subtasks
    return z.object({
      todos: z.array(todoSchema).describe('Complete array of all todos (this replaces the entire existing list)'),
      title: z.string().optional().describe('Descriptive name for the entire todo list (e.g., project name, feature area, or sprint name)')
    });
  }

  private async handleRead(): Promise<any> {
    // Check if auto-inject is enabled
    const autoInject = this.isAutoInjectEnabled();

    if (autoInject && !this.config.standalone) {
      console.log('[TodoMCPServer] Read blocked - auto-inject is enabled');
      return {
        content: [{
          type: 'text',
          text: 'Todo list is automatically available in custom instructions when auto-inject is enabled. This tool is disabled.'
        }]
      };
    }

    const todos = this.todoManager.getTodos();
    const title = this.todoManager.getBaseTitle();
    console.log(`[TodoMCPServer] Reading todos: ${todos.length} items, title: "${title}"`);

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

  private async handleWrite(params: any, context?: any): Promise<any> {
    const { todos, title } = params;

    // Debug logging for context
    console.log('[TodoMCPServer.handleWrite] Context received:', {
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : [],
      fullContext: JSON.stringify(context, null, 2)
    });

    // Get current state before update for comparison
    const previousTodos = this.todoManager.getTodos();
    const previousTitle = this.todoManager.getTitle();

    console.log('[TodoMCPServer.handleWrite] State before update:', {
      previousTodoCount: previousTodos.length,
      previousTitle: previousTitle,
      newTodoCount: todos.length,
      newTitle: title || 'no change',
      todoSync: !!this.todoSync,
      server: this.config.standalone ? 'standalone' : 'vscode'
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
    const inProgressCount = todos.filter((t: any) => t.status === 'in_progress').length;
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
      if (todo.subtasks && !subtasksEnabled && !this.config.standalone) {
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
    console.log(`[TodoMCPServer] Updating todos via MCP: ${todos.length} items, title: ${title || 'no change'}`);

    // Mark this as an external change if we have a todoSync instance
    if (this.todoSync) {
      console.log('[TodoMCPServer] Marking change as external (MCP-initiated)');
      this.todoSync.markExternalChange();
    }

    // Update todos
    await this.todoManager.updateTodos(todos, title);

    // Get state after update
    const finalTodos = this.todoManager.getTodos();
    const finalTitle = this.todoManager.getTitle();

    console.log('[TodoMCPServer.handleWrite] State after update:', {
      finalTodoCount: finalTodos.length,
      finalTitle: finalTitle,
      todosSaved: finalTodos.length === todos.length,
      titleSaved: title === undefined || finalTitle === title
    });

    console.log('[TodoMCPServer] Update completed, todos should sync to VS Code');

    // Generate success message
    const pendingCount = todos.filter((t: any) => t.status === 'pending').length;
    const inProgressTaskCount = todos.filter((t: any) => t.status === 'in_progress').length;
    const completedCount = todos.filter((t: any) => t.status === 'completed').length;

    let statusSummary = `(${pendingCount} pending, ${inProgressTaskCount} in progress, ${completedCount} completed)`;

    // Count subtasks if enabled
    let subtaskInfo = '';
    if (subtasksEnabled) {
      const todosWithSubtasks = todos.filter((t: any) => t.subtasks && t.subtasks.length > 0);
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
    const todosWithAdr = todos.filter((t: any) => t.adr);
    const adrInfo = todosWithAdr.length > 0 ? `\nADR added to ${todosWithAdr.length} task(s)` : '';

    const reminder = inProgressTaskCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';

    const autoInjectNote = this.isAutoInjectEnabled() && !this.config.standalone
      ? '\nNote: Todos are automatically synced to <todos> in .github/copilot-instructions.md'
      : '';

    const titleMsg = title ? ` and title to "${title}"` : '';

    // Broadcast update via SSE and update tools dynamically
    console.log('[TodoMCPServer] Broadcasting update event and updating tools');
    this.broadcastUpdate({
      type: 'todos-updated',
      todos,
      title,
      timestamp: Date.now()
    });

    return {
      content: [{
        type: 'text',
        text: `Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${subtaskInfo}${adrInfo}${reminder}${autoInjectNote}`
      }]
    };
  }

  private isInitializeRequest(message: any): boolean {
    return message && typeof message === 'object' && message.method === 'initialize';
  }

  private cleanupSession(sessionId: string): void {
    const transport = this.transports.get(sessionId);
    const server = this.mcpServers.get(sessionId);
    const sessionTools = this.sessionTools.get(sessionId);

    if (transport) {
      transport.close();
      this.transports.delete(sessionId);
    }

    if (server) {
      server.close();
      this.mcpServers.delete(sessionId);
    }

    if (sessionTools) {
      this.sessionTools.delete(sessionId);
    }

    // Clean up resource subscriptions
    this.resourceSubscriptions.delete(sessionId);

    console.log(`[TodoMCPServer] Cleaned up session: ${sessionId}`);
  }

  private setupEventHandlers(): void {
    // Clean up stale sessions periodically
    setInterval(() => {
      // In a real implementation, you'd track last activity and clean up stale sessions
      console.log(`[TodoMCPServer] Active sessions: ${this.transports.size}`);
    }, 60000); // Every minute
  }

  public async broadcastUpdate(event: any): Promise<void> {
    console.log('[TodoMCPServer] Broadcast update event:', event);

    // Update server configuration if this is a configuration change
    if (event.type === 'configuration-changed' && event.config) {
      if (event.config.autoInject !== undefined) {
        this.config.autoInject = event.config.autoInject;
      }
      if (event.config.enableSubtasks !== undefined) {
        this.config.enableSubtasks = event.config.enableSubtasks;
      }
      if (event.config.autoInjectFilePath !== undefined) {
        this.config.autoInjectFilePath = event.config.autoInjectFilePath;
      }
      console.log('[TodoMCPServer] Server configuration updated:', this.config);
    }

    // If this is a configuration change event OR todos update, update tools dynamically
    if (event.type === 'configuration-changed' || event.type === 'todos-updated') {
      console.log(`[TodoMCPServer] Updating tools dynamically due to ${event.type}`);
      
      // Update tools for all active sessions
      for (const [sessionId, server] of this.mcpServers) {
        this.updateToolsForSession(server, sessionId);
        console.log(`[TodoMCPServer] Updated tools for session: ${sessionId}`);
      }

      // Send resource update notifications to subscribed sessions
      if (event.type === 'todos-updated') {
        this.notifyResourceSubscribers('todos://todos');
      }
    }
  }

  private async notifyResourceSubscribers(resourceUri: string): Promise<void> {
    // Notify all sessions that are subscribed to this resource
    for (const [sessionId, subscriptions] of this.resourceSubscriptions) {
      if (subscriptions.has(resourceUri)) {
        const server = this.mcpServers.get(sessionId);
        if (server) {
          try {
            // Send resource update notification
            server.sendNotification('notifications/resources/updated', {
              uri: resourceUri
            });
            
            console.log(`[TodoMCPServer] Notified session ${sessionId} of resource update: ${resourceUri}`);
          } catch (error) {
            console.error(`[TodoMCPServer] Failed to notify session ${sessionId}:`, error);
          }
        }
      }
    }
  }

  // Legacy method for test compatibility
  public getTodoTools(): any {
    return {
      getAvailableTools: async () => {
        const tools = [];

        // Check if we should show todo_read tool
        const autoInject = this.isAutoInjectEnabled();
        const subtasksEnabled = this.isSubtasksEnabled();
        const hasTodos = this.todoManager.getTodos().length > 0;
        const shouldShowTodoRead = this.config.standalone || (!autoInject && hasTodos);

        if (shouldShowTodoRead) {
          tools.push({
            name: 'todo_read',
            description: this.buildReadDescription(subtasksEnabled),
            inputSchema: this.getEmptyJsonSchema() // Proper JSON schema for test compatibility
          });
        }

        tools.push({
          name: 'todo_write',
          description: this.buildWriteDescription(subtasksEnabled),
          inputSchema: this.getTodoWriteSchema(subtasksEnabled) // Keep JSON schema for tests
        });

        return tools;
      },
      handleToolCall: async (name: string, args: any, context?: any) => {
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
      },
      // Public methods for testing
      getAutoInjectEnabled: () => this.isAutoInjectEnabled(),
      getSubtasksEnabled: () => this.isSubtasksEnabled()
    };
  }

  public async start(port?: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    const serverPort = port || this.config.port || 3000;

    // Initialize MCP components BEFORE creating the server
    await this.initialize();

    return new Promise((resolve, reject) => {
      this.httpServer = createServer(this.app);

      this.httpServer.listen(serverPort, () => {
        this.isRunning = true;
        console.log(`[TodoMCPServer] HTTP server started on port ${serverPort}`);
        console.log(`[TodoMCPServer] Health check: http://localhost:${serverPort}/health`);
        console.log(`[TodoMCPServer] MCP endpoint: http://localhost:${serverPort}/mcp`);
        console.log(`[TodoMCPServer] Server configuration:`, {
          standalone: this.config.standalone,
          autoInject: this.config.autoInject,
          enableSubtasks: this.config.enableSubtasks,
          workspaceRoot: this.config.workspaceRoot
        });
        this.setupEventHandlers();
        resolve();
      });

      this.httpServer.on('error', (error) => {
        this.isRunning = false;
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.httpServer) {
      return;
    }

    // Clean up all sessions
    for (const sessionId of this.transports.keys()) {
      this.cleanupSession(sessionId);
    }

    // Close HTTP server
    return new Promise((resolve) => {
      this.httpServer!.close(() => {
        this.isRunning = false;
        this.httpServer = null;
        resolve();
      });
    });
  }

  public setWorkspaceRoot(root: string): void {
    this.config.workspaceRoot = root;
  }

  public getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  public isStandalone(): boolean {
    return this.config.standalone || false;
  }

  public setTodoManager(manager: any): void {
    this.todoManager = manager;

    // Listen for todo changes to broadcast updates
    if (this.todoManager && this.todoManager.onDidChange) {
      this.todoManager.onDidChange((change: { todos: any[], title: string }) => {
        this.broadcastUpdate({
          type: 'todos-updated',
          todos: change.todos,
          title: change.title,
          timestamp: Date.now()
        });
      });
    }
  }

  public setTodoSync(todoSync: any): void {
    this.todoSync = todoSync;
  }

  public getTodoManager(): any {
    return this.todoManager;
  }

  public setStorage(storage: ITodoStorage): void {
    if (this.todoManager instanceof StandaloneTodoManager) {
      // Dispose of the old manager
      this.todoManager.dispose();
      // Create new manager with the provided storage
      this.todoManager = new StandaloneTodoManager(storage);
    }
  }

  private isAutoInjectEnabled(): boolean {
    if (this.config.standalone) {
      return false; // Always show tools in standalone mode
    }

    // Get autoInject from server configuration
    return this.config.autoInject || false;
  }

  private isSubtasksEnabled(): boolean {
    if (this.config.standalone) {
      return true; // Always enable subtasks in standalone mode
    }

    // Get enableSubtasks from server configuration
    return this.config.enableSubtasks !== undefined ? this.config.enableSubtasks : true;
  }
}
