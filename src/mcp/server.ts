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
import { TelemetryManager } from '../telemetryManager';
import { TodoTools } from './tools/todoTools';
import { SavedTodoList } from '../types';
import { formatTimeAgo, getCompletionStats } from '../utils/timeUtils';

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
  private todoTools: TodoTools | null = null;

  // Dynamic tool management - track tools by ID for each session
  private sessionTools: Map<string, { todoReadTool: any; todoWriteTool: any }> = new Map();

  constructor(config: MCPServerConfig = {}) {
    console.log(`📅 Build timestamp: ${new Date().toISOString()}`);
    console.log(`🔧 Starting TodoMCPServer with config:`, config);

    this.config = {
      port: config.port || 3000,
      workspaceRoot: config.workspaceRoot || process.cwd(),
      standalone: config.standalone === true,
      autoInject: config.autoInject || false,
      autoInjectFilePath: config.autoInjectFilePath || '.github/instructions/todos.instructions.md',
      enableElicitation: config.enableElicitation || false
    };

    console.log(`📋 Final config:`, this.config);
    console.log(`🚀 ==================== TodoMCPServer READY ====================\n`);

    // Initialize todo manager based on mode
    if (this.config.standalone) {
      // Always use InMemoryStorage for standalone mode
      const storage = new InMemoryStorage();
      const autoInjectConfig = this.config.autoInject && this.config.workspaceRoot ? {
        workspaceRoot: this.config.workspaceRoot,
        filePath: this.config.autoInjectFilePath
      } : undefined;
      this.todoManager = StandaloneTodoManager.getInstance(storage, autoInjectConfig);

      // Initialize TodoTools for standalone mode
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
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
    try {
      console.log('[TodoMCPServer] Starting initialization...');

      // Dynamic import for ESM modules - updated for SDK 1.15.0+
      const mcpModule = await import('@modelcontextprotocol/sdk/server/mcp.js');
      const httpModule = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
      const typesModule = await import('@modelcontextprotocol/sdk/types.js');
      const zodModule = await import('zod');

      console.log('[TodoMCPServer] Modules imported successfully:', {
        mcpModule: !!mcpModule,
        httpModule: !!httpModule,
        typesModule: !!typesModule,
        zodModule: !!zodModule
      });

      McpServer = mcpModule.McpServer;
      ResourceTemplate = mcpModule.ResourceTemplate;
      StreamableHTTPServerTransport = httpModule.StreamableHTTPServerTransport;
      isInitializeRequest = typesModule.isInitializeRequest;
      z = zodModule.z;

      console.log('[TodoMCPServer] Global variables assigned:', {
        McpServer: !!McpServer,
        ResourceTemplate: !!ResourceTemplate,
        StreamableHTTPServerTransport: !!StreamableHTTPServerTransport,
        isInitializeRequest: !!isInitializeRequest,
        z: !!z,
        zType: typeof z
      });

      // Test Zod functionality
      try {
        const testSchema = z.object({ test: z.string() });
        const testResult = testSchema.parse({ test: "hello" });
        console.log('[TodoMCPServer] Zod test successful:', testResult);
      } catch (zodError) {
        console.error('[TodoMCPServer] Zod test failed:', {
          error: zodError instanceof Error ? zodError.message : String(zodError),
          stack: zodError instanceof Error ? zodError.stack : undefined
        });
        throw zodError;
      }

      // Setup routes after initialization
      this.setupRoutes();

      console.log('[TodoMCPServer] Initialization completed successfully');
    } catch (error) {
      console.error('[TodoMCPServer] Initialization failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
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
        console.log('[TodoMCPServer] POST /mcp request received:', {
          hasBody: !!req.body,
          bodyType: typeof req.body,
          headers: req.headers,
          bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'no body'
        });

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport = sessionId ? this.transports.get(sessionId) : undefined;
        let server = sessionId ? this.mcpServers.get(sessionId) : undefined;

        console.log('[TodoMCPServer] Session lookup:', {
          sessionId,
          hasTransport: !!transport,
          hasServer: !!server,
          activeSessions: this.transports.size
        });

        // If no existing session and this is an initialize request, create new session
        if (!transport && isInitializeRequest(req.body)) {
          try {
            console.log('[TodoMCPServer] Creating new session for initialize request');

            const newSessionId = randomUUID();
            console.log('[TodoMCPServer] Generated new session ID:', newSessionId);

            // Create transport with session
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => newSessionId,
              onsessioninitialized: async (sessionId: string) => {
                // Send initialization complete log message
                console.log(`[TodoMCPServer] Session initialized: ${sessionId}`);
                this.transports.set(sessionId, transport);
              }
            });

            console.log('[TodoMCPServer] Transport created successfully');

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

            console.log('[TodoMCPServer] MCP server instance created');

            // Store server
            this.mcpServers.set(newSessionId, server);

            // Register initial tools and resources BEFORE connecting
            console.log('[TodoMCPServer] Registering tools and resources...');
            await this.registerToolsAndResources(server, newSessionId);

            // Connect server to transport
            console.log('[TodoMCPServer] Connecting server to transport...');
            await server.connect(transport);

            console.log(`[TodoMCPServer] Created new MCP session: ${newSessionId}`);
          } catch (sessionError) {
            console.error('[TodoMCPServer] Error creating new session:', {
              error: sessionError instanceof Error ? sessionError.message : String(sessionError),
              stack: sessionError instanceof Error ? sessionError.stack : undefined
            });
            throw sessionError;
          }
        }

        if (!transport) {
          console.error('[TodoMCPServer] No transport available for request');
          res.status(400).json({
            error: 'No session found. Send initialize request first.'
          });
          return;
        }

        // Handle the request
        console.log('[TodoMCPServer] Handling request with transport...');
        await transport.handleRequest(req, res, req.body);
        console.log('[TodoMCPServer] Request handled successfully');
      } catch (error) {
        console.error('[TodoMCPServer] Error handling MCP request:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          url: req.url,
          method: req.method,
          headers: req.headers
        });
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
    try {
      console.log(`[TodoMCPServer] Starting tool and resource registration for session ${sessionId}`);

      if (!this.todoManager) {
        console.warn('[TodoMCPServer] No todo manager available during tool registration');
        return;
      }

      if (!z) {
        console.error('[TodoMCPServer] Zod not initialized during tool registration');
        throw new Error('Zod not initialized. Call initialize() first.');
      }

      // Create session tool tracking
      const sessionTools = { todoReadTool: null, todoWriteTool: null };
      this.sessionTools.set(sessionId, sessionTools);

      // Check current state for initial tool registration
      this.updateToolsForSession(server, sessionId);

      console.log(`[TodoMCPServer] Starting resource registration for session ${sessionId}`);

      // Register current todo list resource
      server.registerResource(
        "current-todos",
        new ResourceTemplate("todos://current", { list: undefined }),
        {
          title: "Current Todo List",
          description: "Active todo list in markdown format",
          mimeType: "text/markdown"
        },
        async (uri: any) => {
          try {
            // Get current todos
            const todos = this.todoManager.getTodos();
            const title = this.todoManager.getBaseTitle();

            // Format as markdown
            const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, title);

            return {
              contents: [{
                uri: uri.href,
                mimeType: "text/markdown",
                text: markdown
              }]
            };
          } catch (error) {
            console.error('[TodoMCPServer] Error in current todos resource handler:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
          }
        }
      );

      // Register historical todo list resources with dynamic template and completion support
      server.registerResource(
        "todo-lists",
        new ResourceTemplate("todos://{slug}", { 
          list: async () => {
            try {
              // List all saved todo lists (previously called "archives")
              const savedLists = this.todoManager.getSavedLists();
              return {
                resources: savedLists.map((list: SavedTodoList) => {
                  const stats = getCompletionStats(list.todos);
                  const timeAgo = formatTimeAgo(list.savedAt);
                  return {
                    uri: `todos://${list.slug}`,
                    name: list.title,
                    description: `${stats.completed}/${stats.total} completed, ${timeAgo}`,
                    mimeType: "text/markdown"
                  };
                })
              };
            } catch (error) {
              console.error('[TodoMCPServer] Error listing todo list resources:', error);
              return { resources: [] };
            }
          },
          complete: {
            slug: (partialSlug: string, context?: { arguments?: Record<string, string> }) => {
              try {
                console.log(`[TodoMCPServer] Completing todo list slug for input: "${partialSlug}"`);

                // Get all available slugs
                const availableSlugs = this.todoManager.getSavedListSlugs();
                console.log(`[TodoMCPServer] Available todo list slugs:`, availableSlugs);

                // Filter slugs that start with the partial input (case-insensitive)
                const matches = availableSlugs.filter((slug: string) =>
                  slug.toLowerCase().startsWith(partialSlug.toLowerCase())
                );

                console.log(`[TodoMCPServer] Filtered matches for "${partialSlug}":`, matches);
                return matches;
              } catch (error) {
                console.error('[TodoMCPServer] Error in todo list slug completion:', error);
                return [];
              }
            }
          }
        }),
        {
          description: "Access to saved todo lists",
          mimeType: "text/markdown"
        },
        async (uri: any, variables: any) => {
          try {
            const slug = variables.slug;
            console.log(`[TodoMCPServer] Reading todo list resource for slug: ${slug}`);
            
            const savedList = this.todoManager.getSavedListBySlug(slug);
            if (!savedList) {
              throw new Error(`Todo list not found for slug: ${slug}`);
            }

            // Format todos as markdown
            const timeAgo = formatTimeAgo(savedList.savedAt);
            const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(
              savedList.todos, 
              `${savedList.title} (${timeAgo})`
            );

            return {
              contents: [{
                uri: uri.href,
                mimeType: "text/markdown",
                text: markdown
              }]
            };
          } catch (error) {
            console.error('[TodoMCPServer] Error in todo list resource handler:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              slug: variables?.slug
            });
            throw error;
          }
        }
      );

      console.log(`[TodoMCPServer] Successfully registered tools and resources for session ${sessionId}`);
    } catch (error) {
      console.error(`[TodoMCPServer] Error registering tools and resources for session ${sessionId}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        todoManagerAvailable: !!this.todoManager,
        zodAvailable: !!z
      });
      throw error;
    }
  }

  private updateToolsForSession(server: any, sessionId: string): void {
    try {
      console.log(`[TodoMCPServer] Starting tool update for session ${sessionId}`);

      const sessionTools = this.sessionTools.get(sessionId);
      if (!sessionTools) {
        console.warn(`[TodoMCPServer] No session tools found for session ${sessionId}`);
        return;
      }

      if (!z) {
        console.error('[TodoMCPServer] Zod not available during tool update');
        throw new Error('Zod not initialized');
      }

      // Check if we should show todo_read tool
      const autoInject = this.isAutoInjectEnabled();
      const hasTodos = this.todoManager.getTodos().length > 0;
      const shouldShowTodoRead = this.config.standalone || (!autoInject && hasTodos);

      console.log(`[TodoMCPServer] Tool visibility logic for session ${sessionId}:`, {
        autoInject,
        hasTodos,
        standalone: this.config.standalone,
        shouldShowTodoRead
      });

      // Handle todo_read tool
      if (shouldShowTodoRead && !sessionTools.todoReadTool) {
        try {
          console.log(`[TodoMCPServer] Adding todo_read tool for session ${sessionId}`);

          // Test Zod schema creation first
          const emptySchema = this.getEmptyZodSchema();
          console.log(`[TodoMCPServer] Empty Zod schema created successfully:`, {
            type: typeof emptySchema,
            hasParseMethod: typeof emptySchema.parse === 'function',
            constructor: emptySchema.constructor.name
          });

          // Add todo_read tool using modern registerTool API with proper descriptions
          sessionTools.todoReadTool = server.registerTool(
            "todo_read",
            {
              title: "Check Todos",
              description: this.buildReadDescription(),
              inputSchema: emptySchema, // Proper Zod schema for no parameters
              annotations: {
                readOnlyHint: true
              }
            },
            async () => {
              try {
                return await this.handleRead();
              } catch (error) {
                console.error(`[TodoMCPServer] Error in todo_read handler:`, {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined
                });
                throw error;
              }
            }
          );
          console.log(`[TodoMCPServer] Successfully added todo_read tool for session ${sessionId}`);
        } catch (error) {
          console.error(`[TodoMCPServer] Error adding todo_read tool for session ${sessionId}:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          throw error;
        }
      } else if (!shouldShowTodoRead && sessionTools.todoReadTool) {
        try {
          // Remove todo_read tool
          sessionTools.todoReadTool.remove();
          sessionTools.todoReadTool = null;
          console.log(`[TodoMCPServer] Removed todo_read tool for session ${sessionId}`);
        } catch (error) {
          console.error(`[TodoMCPServer] Error removing todo_read tool for session ${sessionId}:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }

      // Handle todo_write tool (always present but schema may change)
      if (!sessionTools.todoWriteTool) {
        try {
          console.log(`[TodoMCPServer] Adding todo_write tool for session ${sessionId}`);

          // Test Zod schema creation first
          const writeSchema = this.getTodoWriteZodSchema();
          console.log(`[TodoMCPServer] Write Zod schema created successfully:`, {
            type: typeof writeSchema,
            hasParseMethod: typeof writeSchema.parse === 'function',
            constructor: writeSchema.constructor.name
          });

          sessionTools.todoWriteTool = server.registerTool(
            "todo_write",
            {
              title: "Update Todos",
              description: this.buildWriteDescription(),
              inputSchema: writeSchema,
              annotations: {
                readOnlyHint: false
              }
            },
            async (args: any, { sendNotification, _meta }: any) => {
              try {
                console.log(`\n🔔 ==================== NOTIFICATION DEBUG START ====================`);
                console.log(`[TodoMCPServer] 🔔 TOOL HANDLER: todo_write called with context parameters`);
                console.log(`[TodoMCPServer] Context analysis:`, {
                  hasSendNotification: !!sendNotification,
                  sendNotificationType: typeof sendNotification,
                  sendNotificationName: sendNotification?.name || 'anonymous',
                  hasMetaObject: !!_meta,
                  metaType: typeof _meta,
                  metaKeys: _meta ? Object.keys(_meta) : 'no _meta',
                  hasProgressToken: !!_meta?.progressToken,
                  progressTokenType: typeof _meta?.progressToken,
                  progressTokenValue: _meta?.progressToken,
                  argsKeys: args ? Object.keys(args) : 'no args'
                });

                // Reconstruct context object with proper destructured parameters
                const context = {
                  sendNotification,
                  _meta
                };

                console.log(`[TodoMCPServer] 📦 Reconstructed context:`, {
                  contextKeys: Object.keys(context),
                  contextSendNotification: !!context.sendNotification,
                  contextMeta: !!context._meta,
                  contextProgressToken: context._meta?.progressToken
                });
                console.log(`🔔 ==================== CALLING handleWrite ====================\n`);

                const result = await this.handleWrite(args, context);

                console.log(`\n🔔 ==================== NOTIFICATION DEBUG END ====================\n`);
                return result;
              } catch (error) {
                console.error(`[TodoMCPServer] ❌ Error in todo_write handler:`, {
                  error: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  args: JSON.stringify(args, null, 2)
                });
                throw error;
              }
            }
          );
          console.log(`[TodoMCPServer] Successfully added todo_write tool for session ${sessionId}`);
        } catch (error) {
          console.error(`[TodoMCPServer] Error adding todo_write tool for session ${sessionId}:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          throw error;
        }
      } else {
        try {
          // Update existing tool schema
          console.log(`[TodoMCPServer] Updating existing todo_write tool for session ${sessionId}`);

          const writeSchema = this.getTodoWriteZodSchema();
          console.log(`[TodoMCPServer] Updated write Zod schema created successfully:`, {
            type: typeof writeSchema,
            hasParseMethod: typeof writeSchema.parse === 'function',
            constructor: writeSchema.constructor.name
          });

          sessionTools.todoWriteTool.update({
            title: "Update Todos",
            description: this.buildWriteDescription(),
            inputSchema: writeSchema,
            annotations: {
              readOnlyHint: false
            }
          });
          console.log(`[TodoMCPServer] Successfully updated todo_write tool for session ${sessionId}`);
        } catch (error) {
          console.error(`[TodoMCPServer] Error updating todo_write tool for session ${sessionId}:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          throw error;
        }
      }

      console.log(`[TodoMCPServer] Tool update completed for session ${sessionId}`);
    } catch (error) {
      console.error(`[TodoMCPServer] Critical error in updateToolsForSession for session ${sessionId}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        zodAvailable: !!z,
        todoManagerAvailable: !!this.todoManager
      });
      throw error;
    }
  }

  private buildReadDescription(): string {
    return `Use this tool to read the current to-do list for the session. This tool should be used proactively and frequently to ensure that you are aware of the status of the current task list.

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
Returns JSON with title and todos array. Each todo includes id, content, status, priority, adr.
</response>`;
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
• Use subtasks for multi-day efforts
• Document assumptions and decisions in ADR
• Keep task descriptions specific and measurable
</best-practices>`;

    return basePrompt + footer;
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

  private getEmptyZodSchema(): any {
    try {
      if (!z) {
        console.error('[TodoMCPServer] getEmptyZodSchema: Zod not initialized');
        throw new Error('Zod not initialized. Call initialize() first.');
      }

      // Return empty ZodRawShape (plain object) for registerTool - it will be wrapped internally
      const schema = {};
      console.log('[TodoMCPServer] getEmptyZodSchema: Created empty ZodRawShape successfully:', {
        type: typeof schema,
        isPlainObject: typeof schema === 'object' && schema !== null,
        zodAvailable: !!z
      });

      return schema;
    } catch (error) {
      console.error('[TodoMCPServer] getEmptyZodSchema: Error creating empty ZodRawShape:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        zodAvailable: !!z,
        zodType: typeof z
      });
      throw error;
    }
  } private getEmptyJsonSchema(): any {
    return {
      type: 'object',
      properties: {},
      required: []
    };
  }

  private getTodoWriteZodSchema(): any {
    try {
      if (!z) {
        console.error('[TodoMCPServer] getTodoWriteZodSchema: Zod not initialized');
        throw new Error('Zod not initialized. Call initialize() first.');
      }

      console.log('[TodoMCPServer] getTodoWriteZodSchema: Starting schema creation');

      // Return ZodRawShape (plain object) for registerTool - it will be wrapped internally
      const schema = {
        todos: z.array(z.object({
          id: z.string().describe('Unique kebab-case identifier for the task (e.g., "implement-user-auth")'),
          content: z.string().min(1).describe('Clear, specific description of what needs to be done'),
          status: z.enum(['pending', 'in_progress', 'completed']).describe('Current state: pending (not started), in_progress (actively working), completed (finished). Only ONE task can be in_progress.'),
          priority: z.enum(['low', 'medium', 'high']).describe('Importance level: high (urgent/critical), medium (important), low (nice-to-have)'),
          adr: z.string().optional().describe('Architecture Decision Record: technical context, rationale, implementation notes, or decisions made')
        })).describe('Complete array of all todos (this replaces the entire existing list)'),
        title: z.string().optional().describe('Descriptive name for the entire todo list (e.g., project name, feature area, or sprint name)')
      };

      console.log('[TodoMCPServer] getTodoWriteZodSchema: Schema created successfully:', {
        type: typeof schema,
        isPlainObject: typeof schema === 'object' && schema !== null,
        hasProperties: Object.keys(schema).length > 0,
        properties: Object.keys(schema)
      });

      return schema;
    } catch (error) {
      console.error('[TodoMCPServer] getTodoWriteZodSchema: Error creating ZodRawShape:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        zodAvailable: !!z,
        zodType: typeof z
      });
      throw error;
    }
  }

  private async handleRead(): Promise<any> {
    // Check if auto-inject is enabled
    const autoInject = this.isAutoInjectEnabled();

    if (autoInject && !this.config.standalone) {
      console.log('[TodoMCPServer] Read blocked - auto-inject is enabled');
      
      // Send telemetry for blocked read
      try {
        const telemetryManager = TelemetryManager.getInstance();
        if (telemetryManager.isEnabled()) {
          telemetryManager.sendEvent('mcp.read.blocked', {
            reason: 'auto-inject-enabled'
          });
        }
      } catch (telemetryError) {
        console.error('[TodoMCPServer] Failed to send telemetry:', telemetryError);
      }
      
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

    // Send telemetry for successful read
    try {
      const telemetryManager = TelemetryManager.getInstance();
      if (telemetryManager.isEnabled()) {
        telemetryManager.sendEvent('mcp.read.success', {
          standalone: String(this.config.standalone)
        }, {
          todoCount: todos.length
        });
      }
    } catch (telemetryError) {
      console.error('[TodoMCPServer] Failed to send telemetry:', telemetryError);
    }

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
    console.log('[TodoMCPServer.handleWrite] 🎯 ENTRY POINT DEBUG:', {
      methodCalled: 'handleWrite',
      timestamp: new Date().toISOString(),
      hasParams: !!params,
      paramsKeys: params ? Object.keys(params) : [],
      todosLength: Array.isArray(todos) ? todos.length : 'not array',
      title: title || 'undefined'
    });
    
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
    console.log(`[TodoMCPServer] Updating todos via MCP: ${todos.length} items, title: ${title || 'no change'}`);

    // Mark this as an external change if we have a todoSync instance
    if (this.todoSync) {
      console.log('[TodoMCPServer] Marking change as external (MCP-initiated)');
      this.todoSync.markExternalChange();
    }

    // Use TodoTools.handleWrite for proper notification support
    let result;
    console.log('[TodoMCPServer.handleWrite] 🔍 DEBUGGING: Checking TodoTools state:', {
      hasTodoTools: !!this.todoTools,
      todoToolsType: this.todoTools ? typeof this.todoTools : 'null',
      hasContext: !!context,
      contextType: context ? typeof context : 'null',
      contextKeys: context ? Object.keys(context) : []
    });
    
    if (this.todoTools) {
      console.log('[TodoMCPServer] Using TodoTools.handleToolCall(todo_write) with context for notifications');
      result = await this.todoTools.handleToolCall('todo_write', { todos, title }, context);
    } else {
      console.log('[TodoMCPServer] Warning: TodoTools not initialized, falling back to direct manager call');
      // Fallback to direct update if TodoTools not available
      await this.todoManager.updateTodos(todos, title);
      result = null;
    }

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

    // If TodoTools handled the request, return its result directly (includes notifications)
    if (result) {
      console.log('[TodoMCPServer] Returning result from TodoTools (includes notification handling)');
      return result;
    }

    // Fallback: Generate success message for direct manager calls
    const pendingCount = todos.filter((t: any) => t.status === 'pending').length;
    const inProgressTaskCount = todos.filter((t: any) => t.status === 'in_progress').length;
    const completedCount = todos.filter((t: any) => t.status === 'completed').length;

    let statusSummary = `(${pendingCount} pending, ${inProgressTaskCount} in progress, ${completedCount} completed)`;

    // Count todos with adr
    const todosWithAdr = todos.filter((t: any) => t.adr);
    const adrInfo = todosWithAdr.length > 0 ? `\nADR added to ${todosWithAdr.length} task(s)` : '';

    const reminder = inProgressTaskCount === 0 && pendingCount > 0 ? '\nReminder: Mark a task as in_progress BEFORE starting work on it.' : '';

    const autoInjectNote = this.isAutoInjectEnabled() && !this.config.standalone
      ? '\nNote: Todos are automatically synced to <todos> in instructions file'
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

    // Send telemetry for successful write
    try {
      const telemetryManager = TelemetryManager.getInstance();
      if (telemetryManager.isEnabled()) {
        telemetryManager.sendEvent('mcp.write.success', {
          standalone: String(this.config.standalone),
          hasTitle: String(!!title)
        }, {
          todoCount: todos.length,
          inProgressCount: inProgressTaskCount,
          pendingCount: pendingCount,
          completedCount: completedCount
        });
      }
    } catch (telemetryError) {
      console.error('[TodoMCPServer] Failed to send telemetry:', telemetryError);
    }

    return {
      content: [{
        type: 'text',
        text: `Successfully updated ${todos.length} todo items ${statusSummary}${titleMsg}${adrInfo}${reminder}${autoInjectNote}`
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

  public async broadcastResourceListChanged(): Promise<void> {
    console.log('[TodoMCPServer] Broadcasting resource list changed notification');
    
    // Send resource list changed notification to all active sessions
    for (const [sessionId, server] of this.mcpServers) {
      try {
        server.sendResourceListChanged();
        console.log(`[TodoMCPServer] Sent resource list changed notification to session: ${sessionId}`);
      } catch (error) {
        console.error(`[TodoMCPServer] Failed to send resource list changed notification to session ${sessionId}:`, error);
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
        const hasTodos = this.todoManager.getTodos().length > 0;
        const shouldShowTodoRead = this.config.standalone || (!autoInject && hasTodos);

        if (shouldShowTodoRead) {
          tools.push({
            name: 'todo_read',
            description: this.buildReadDescription(),
            inputSchema: this.getEmptyJsonSchema() // Proper JSON schema for test compatibility
          });
        }

        tools.push({
          name: 'todo_write',
          description: this.buildWriteDescription(),
          inputSchema: this.getTodoWriteSchema() // Keep JSON schema for tests
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
      getAutoInjectEnabled: () => this.isAutoInjectEnabled()
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

  public getMcpServer(context?: any): any {
    // Try to extract session ID from context meta if available
    const sessionId = context?._meta?.sessionId;

    if (sessionId && this.mcpServers.has(sessionId)) {
      return this.mcpServers.get(sessionId);
    }

    // Fallback: Return any available MCP server (for single-session scenarios)
    const servers = Array.from(this.mcpServers.values());
    if (servers.length > 0) {
      return servers[0]; // Return the first available server
    }

    console.warn('[TodoMCPServer] No MCP server available for elicitation');
    return null;
  }

  public setTodoManager(manager: any): void {
    console.log('[TodoMCPServer.setTodoManager] 🔧 Setting todo manager:', {
      hasManager: !!manager,
      managerType: manager ? typeof manager : 'null'
    });
    
    this.todoManager = manager;

    // Initialize TodoTools with the manager for notification support
    if (this.todoManager) {
      console.log('[TodoMCPServer.setTodoManager] 🛠️ Creating TodoTools instance');
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
      console.log('[TodoMCPServer.setTodoManager] ✅ TodoTools created successfully:', {
        hasTodoTools: !!this.todoTools,
        todoToolsConstructor: this.todoTools.constructor.name
      });
    } else {
      console.log('[TodoMCPServer.setTodoManager] ⚠️ No manager provided, TodoTools not created');
    }

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

    // Listen for saved list changes to notify resource list updates
    if (this.todoManager && this.todoManager.onSavedListChange) {
      this.todoManager.onSavedListChange(() => {
        console.log('[TodoMCPServer] Saved list changed, sending resource list changed notification');
        this.broadcastResourceListChanged();
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

  public isElicitationEnabled(): boolean {
    return this.config.enableElicitation || false;
  }
}
