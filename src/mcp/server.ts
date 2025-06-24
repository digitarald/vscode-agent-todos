// HTTP MCP server implementation using StreamableHTTPServerTransport
import express, { Express, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { TodoTools } from './tools/todoTools';
import { MCPServerConfig } from './types';
import { StandaloneTodoManager } from './standaloneTodoManager';
import { ITodoStorage } from '../storage/ITodoStorage';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { CopilotInstructionsStorage } from '../storage/CopilotInstructionsStorage';

// Dynamic imports for ESM modules
let Server: any;
let StreamableHTTPServerTransport: any;
let ListToolsRequestSchema: any;
let CallToolRequestSchema: any;

export class TodoMCPServer {
  private app: Express;
  private httpServer: HTTPServer | null = null;
  private todoManager: StandaloneTodoManager | any;
  private todoTools: TodoTools | null = null;
  private config: MCPServerConfig;
  private isRunning: boolean = false;
  private transports: Map<string, any> = new Map();
  private servers: Map<string, any> = new Map();

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      port: config.port || 3000,
      workspaceRoot: config.workspaceRoot || process.cwd(),
      standalone: config.standalone === true,
      autoInject: config.autoInject || false
    };

    // Initialize todo manager based on mode
    if (this.config.standalone) {
      // Create appropriate storage based on autoInject setting
      const storage = this.createStorage();
      this.todoManager = StandaloneTodoManager.getInstance(storage);
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

    // Import and initialize tools
    const { TodoTools } = await import('./tools/todoTools.js');
    if (this.todoManager) {
      this.todoTools = new TodoTools(this.todoManager, this);
    } else {
      console.warn('No todo manager available during initialization');
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
            onsessioninitialized: (sessionId: string) => {
              console.log(`Session initialized: ${sessionId}`);
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
                tools: {}
              }
            }
          );

          // Store server
          this.servers.set(newSessionId, server);

          // Register handlers BEFORE connecting
          this.registerHandlers(server);

          // Connect server to transport
          await server.connect(transport);

          console.log(`Created new MCP session: ${newSessionId}`);
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
        console.error('Error handling MCP request:', error);
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
      const tools = await this.todoTools!.getAvailableTools();
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
      const { name, arguments: args } = request.params;

      console.log('[MCPServer] CallToolRequest:', {
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

      console.log('[MCPServer] Passing context to tool:', JSON.stringify(context, null, 2));

      return await this.todoTools!.handleToolCall(name, args, context);
    });
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

    console.log(`Cleaned up session: ${sessionId}`);
  }

  private setupEventHandlers(): void {
    // Clean up stale sessions periodically
    setInterval(() => {
      // In a real implementation, you'd track last activity and clean up stale sessions
      console.log(`Active sessions: ${this.transports.size}`);
    }, 60000); // Every minute
  }

  public broadcastUpdate(event: any): void {
    // In HTTP mode with sessions, updates aren't broadcast
    // Each session maintains its own state
    console.log('Update event:', event);

    // If this is a configuration change event, we should reinitialize tools
    // to ensure they reflect the latest configuration
    if (event.type === 'configuration-changed' && this.todoTools && this.todoManager) {
      // Recreate tools with updated configuration
      this.todoTools = new TodoTools(this.todoManager, this);
      console.log('MCP tools reinitialized due to configuration change');
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
        console.log(`MCP Todo Server (HTTP) running on http://localhost:${serverPort}`);
        console.log(`Health check: http://localhost:${serverPort}/health`);
        console.log(`MCP endpoint: http://localhost:${serverPort}/mcp`);
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
      this.todoTools = new TodoTools(this.todoManager, this);
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

  public getTodoManager(): any {
    return this.todoManager;
  }

  private createStorage(): ITodoStorage {
    if (this.config.autoInject && this.config.workspaceRoot) {
      return new CopilotInstructionsStorage(
        this.config.workspaceRoot,
        this.config.autoInjectFilePath
      );
    }
    return new InMemoryStorage();
  }

  public setStorage(storage: ITodoStorage): void {
    if (this.todoManager instanceof StandaloneTodoManager) {
      // Dispose of the old manager
      this.todoManager.dispose();
      // Create new manager with the provided storage
      this.todoManager = new StandaloneTodoManager(storage);
      // Re-initialize tools if they exist
      if (this.todoTools) {
        this.todoTools = new TodoTools(this.todoManager, this);
      }
    }
  }
}