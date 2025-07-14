// HTTP MCP server implementation using StreamableHTTPServerTransport
import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { TodoTools } from './tools/todoTools';
import { MCPServerConfig } from './types';
import { StandaloneTodoManager } from './standaloneTodoManager';
import { ITodoStorage } from '../storage/ITodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';

// Dynamic imports for ESM modules
let Server: any;
let StreamableHTTPServerTransport: any;
let ListToolsRequestSchema: any;
let CallToolRequestSchema: any;
let ListResourcesRequestSchema: any;
let ReadResourceRequestSchema: any;
let SubscribeRequestSchema: any;
let UnsubscribeRequestSchema: any;

export class TodoMCPServer {
  private app: Express;
  private httpServer: HTTPServer | null = null;
  private todoManager: StandaloneTodoManager | any;
  private todoTools: TodoTools | null = null;
  private config: MCPServerConfig;
  private isRunning: boolean = false;
  private transports: Map<string, any> = new Map();
  private servers: Map<string, any> = new Map();
  private todoSync: any = null;
  private resourceSubscriptions: Map<string, Set<string>> = new Map(); // sessionId -> resource URIs
  private readonly loggerName = 'TodoMCPServer';

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
    // Dynamic import for ESM modules - updated for SDK 1.13.0
    const mcpModule = await import('@modelcontextprotocol/sdk/server/index.js');
    const httpModule = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const typesModule = await import('@modelcontextprotocol/sdk/types.js');

    Server = mcpModule.Server;
    StreamableHTTPServerTransport = httpModule.StreamableHTTPServerTransport;
    ListToolsRequestSchema = typesModule.ListToolsRequestSchema;
    CallToolRequestSchema = typesModule.CallToolRequestSchema;
    ListResourcesRequestSchema = typesModule.ListResourcesRequestSchema;
    ReadResourceRequestSchema = typesModule.ReadResourceRequestSchema;
    SubscribeRequestSchema = typesModule.SubscribeRequestSchema;
    UnsubscribeRequestSchema = typesModule.UnsubscribeRequestSchema;

    // Import and initialize tools
    const { TodoTools } = await import('./tools/todoTools.js');
    if (this.todoManager) {
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
    } else {
      console.warn('[TodoMCPServer] No todo manager available during initialization');
    }

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
        let server = sessionId ? this.servers.get(sessionId) : undefined;

        // If no existing session and this is an initialize request, create new session
        if (!transport && this.isInitializeRequest(req.body)) {
          const newSessionId = randomUUID();

          // Create transport with session
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessioninitialized: async (sessionId: string) => {
              // Send initialization complete log message
              await server.sendLoggingMessage({
                level: 'info',
                logger: this.loggerName,
                data: `Session initialized: ${sessionId}`
              });
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

          // Create MCP server
          server = new Server(
            {
              name: 'todos-mcp-server',
              version: '1.0.0'
            },
            {
              capabilities: {
                tools: {},
                resources: {
                  subscribe: true
                },
                logging: {}
              }
            }
          );

          // Store server
          this.servers.set(newSessionId, server);

          // Register handlers BEFORE connecting
          this.registerHandlers(server);

          // Connect server to transport
          await server.connect(transport);

          // Log new session creation
          if (server) {
            await server.sendLoggingMessage({
              level: 'info',
              logger: this.loggerName,
              data: `New MCP session created: ${newSessionId}`
            });
          }
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

  private isInitializeRequest(message: any): boolean {
    return message && typeof message === 'object' && message.method === 'initialize';
  }

  private registerHandlers(server: any): void {
    if (!this.todoTools) {
      throw new Error('TodoTools not initialized');
    }

    // Register tool handlers with proper schemas
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Always get fresh tools to reflect current configuration
      const tools = await this.todoTools!.getAvailableTools();
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
      const { name, arguments: args } = request.params;

      // Log tool invocation
      await server.sendLoggingMessage({
        level: 'debug',
        logger: this.loggerName,
        data: `Tool invoked: ${request.params.name}`
      });
      
      console.log('[TodoMCPServer] CallToolRequest:', {
        toolName: name,
        hasExtra: !!extra,
        extraKeys: extra ? Object.keys(extra) : [],
        hasSendNotification: !!extra?.sendNotification,
        sendNotificationType: typeof extra?.sendNotification,
        requestParams: Object.keys(request.params),
        hasMeta: !!request.params._meta,
        metaContent: request.params._meta,
        fullRequest: JSON.stringify(request, null, 2),
        fullExtra: JSON.stringify(extra, null, 2)
      });

      const context = {
        sendNotification: extra?.sendNotification,
        _meta: request.params._meta
      };

      console.log('[TodoMCPServer] Passing context to tool:', JSON.stringify(context, null, 2));

      return await this.todoTools!.handleToolCall(name, args, context);
    });

    // Register resource handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [{
          uri: "todos://todos",
          name: "Todo List",
          description: "Current todo list in markdown format",
          mimeType: "text/markdown"
        }]
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      if (request.params.uri === "todos://todos") {
        // Get current todos
        const todos = this.todoManager.getTodos();
        const title = this.todoManager.getBaseTitle();
        
        // Format as markdown
        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, title, true);
        
        return {
          contents: [{
            uri: "todos://todos",
            mimeType: "text/markdown",
            text: markdown
          }]
        };
      }
      
      throw new Error(`Resource not found: ${request.params.uri}`);
    });

    // Handle resource subscriptions
    server.setRequestHandler(SubscribeRequestSchema, async (request: any, extra: any) => {
      const sessionId = this.getSessionIdFromExtra(extra);
      if (!sessionId) {
        throw new Error('No session ID found for subscription');
      }
      
      const resourceUri = request.params.uri;
      
      // Add subscription
      if (!this.resourceSubscriptions.has(sessionId)) {
        this.resourceSubscriptions.set(sessionId, new Set());
      }
      this.resourceSubscriptions.get(sessionId)!.add(resourceUri);
      
      // Log subscription
      await server.sendLoggingMessage({
        level: 'debug',
        logger: this.loggerName,
        data: `Session ${sessionId} subscribed to resource: ${resourceUri}`
      });
      
      console.log(`[TodoMCPServer] Session ${sessionId} subscribed to resource: ${resourceUri}`);
      
      return { success: true };
    });

    server.setRequestHandler(UnsubscribeRequestSchema, async (request: any, extra: any) => {
      const sessionId = this.getSessionIdFromExtra(extra);
      if (!sessionId) {
        throw new Error('No session ID found for unsubscription');
      }
      
      const resourceUri = request.params.uri;
      
      // Remove subscription
      const subscriptions = this.resourceSubscriptions.get(sessionId);
      if (subscriptions) {
        subscriptions.delete(resourceUri);
        if (subscriptions.size === 0) {
          this.resourceSubscriptions.delete(sessionId);
        }
      }
      
      // Log unsubscription
      await server.sendLoggingMessage({
        level: 'debug',
        logger: this.loggerName,
        data: `Session ${sessionId} unsubscribed from resource: ${resourceUri}`
      });
      
      console.log(`[TodoMCPServer] Session ${sessionId} unsubscribed from resource: ${resourceUri}`);
      
      return { success: true };
    });
  }

  private getSessionIdFromExtra(extra: any): string | undefined {
    // The session ID should be available in the extra context
    // This might need adjustment based on the actual SDK implementation
    for (const [sessionId, server] of this.servers) {
      if (server === extra?.server) {
        return sessionId;
      }
    }
    return undefined;
  }

  private async updateAllSessionHandlers(): Promise<void> {
    console.log(`[TodoMCPServer] Updating handlers for ${this.servers.size} active sessions`);
    
    // Re-register handlers for all active sessions
    for (const [sessionId, server] of this.servers) {
      console.log(`[TodoMCPServer] Re-registering handlers for session: ${sessionId}`);
      
      // Log handler update to MCP
      try {
        await server.sendLoggingMessage({
          level: 'debug',
          logger: this.loggerName,
          data: `Re-registered handlers for session: ${sessionId}`
        });
      } catch (error) {
        // Session might be closing, ignore logging errors
      }
      this.registerHandlers(server);
    }
  }

  private cleanupSession(sessionId: string): void {
    const transport = this.transports.get(sessionId);
    const server = this.servers.get(sessionId);

    if (transport) {
      transport.close();
      this.transports.delete(sessionId);
    }

    if (server) {
      server.close();
      this.servers.delete(sessionId);
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
    // In HTTP mode with sessions, updates aren't broadcast
    // Each session maintains its own state
    console.log('[TodoMCPServer] Broadcast update event:', event);
    
    // Log update to all sessions
    for (const [, server] of this.servers) {
      try {
        await server.sendLoggingMessage({
          level: 'info',
          logger: this.loggerName,
          data: `Update broadcasted: ${event.type}`
        });
      } catch (error) {
        // Session might be closing, ignore logging errors
      }
    }

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
      
      // Log configuration details to MCP
      for (const server of this.servers.values()) {
        try {
          await server.sendLoggingMessage({
            level: 'info',
            logger: this.loggerName,
            data: `Configuration updated - autoInject: ${this.config.autoInject}, enableSubtasks: ${this.config.enableSubtasks}`
          });
        } catch (error) {
          // Session might be closing, ignore logging errors
        }
      }
    }

    // If this is a configuration change event OR todos update, we should reinitialize tools
    // to ensure they reflect the latest configuration and todo state
    if ((event.type === 'configuration-changed' || event.type === 'todos-updated') && this.todoTools && this.todoManager) {
      // Recreate tools with updated configuration/state
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
      console.log(`[TodoMCPServer] MCP tools reinitialized due to ${event.type}`);
      
      // Log tool reinitialization
      for (const server of this.servers.values()) {
        try {
          await server.sendLoggingMessage({
            level: 'info',
            logger: this.loggerName,
            data: `Tools reinitialized due to ${event.type}`
          });
        } catch (error) {
          // Session might be closing, ignore logging errors
        }
      }
      
      // Update handlers for all active sessions to reflect new tool schemas
      this.updateAllSessionHandlers();
      
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
        const server = this.servers.get(sessionId);
        if (server) {
          try {
            // Send resource update notification
            server.sendNotification('notifications/resources/updated', {
              uri: resourceUri
            });
            // Log successful notification
            await server.sendLoggingMessage({
              level: 'debug',
              logger: this.loggerName,
              data: `Notified session ${sessionId} of resource update: ${resourceUri}`
            });
            
            console.log(`[TodoMCPServer] Notified session ${sessionId} of resource update: ${resourceUri}`);
          } catch (error) {
            console.error(`[TodoMCPServer] Failed to notify session ${sessionId}:`, error);
          }
        }
      }
    }
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

  public getTodoTools(): TodoTools {
    if (!this.todoTools) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
    return this.todoTools;
  }

  public setTodoManager(manager: any): void {
    this.todoManager = manager;
    // Re-initialize tools if they exist
    if (this.todoTools) {
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
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
  }

  public setTodoSync(todoSync: any): void {
    this.todoSync = todoSync;
    // Update tools if they exist
    if (this.todoTools) {
      this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
    }
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
      // Re-initialize tools if they exist
      if (this.todoTools) {
        this.todoTools = new TodoTools(this.todoManager, this, this.todoSync);
      }
    }
  }
}