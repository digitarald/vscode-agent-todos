import * as vscode from 'vscode';
import { TodoMCPServer } from './server';
import { TodoSync } from './todoSync';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from './standaloneTodoManager';
import { ITodoStorage } from '../storage/ITodoStorage';
import { WorkspaceStateStorage } from '../storage/WorkspaceStateStorage';
import * as net from 'net';
import { PerformanceMonitor } from '../utils/performance';

export class TodoMCPServerProvider implements vscode.McpServerDefinitionProvider {
  private server: TodoMCPServer | null = null;
  private serverPort: number = 0;
  private todoSync: TodoSync | null = null;
  private _onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;

  constructor(private context: vscode.ExtensionContext) { }

  async provideMcpServerDefinitions(): Promise<vscode.McpServerDefinition[]> {
    if (!this.server) {
      await this.ensureServerStarted();
    }

    return [
      new vscode.McpHttpServerDefinition(
        'Agent TODOs',
        vscode.Uri.parse(`http://localhost:${this.serverPort}/mcp`)
      )
    ];
  }

  async resolveMcpServerDefinition(
    definition: vscode.McpServerDefinition,
    token: vscode.CancellationToken
  ): Promise<vscode.McpServerDefinition> {
    // Ensure server is started
    await this.ensureServerStarted();

    // Return the definition as-is, VS Code will handle session management
    return definition;
  }

  async ensureServerStarted(): Promise<void> {
    if (this.server) {
      return;
    }

    await PerformanceMonitor.measure('MCP Server Startup', async () => {
      // Find an available port
      this.serverPort = await this.findAvailablePort();

      // Get current configuration
      const config = vscode.workspace.getConfiguration('agentTodos');
      const enableSubtasks = config.get<boolean>('enableSubtasks', true);

      // Create server instance
      this.server = new TodoMCPServer({
        port: this.serverPort,
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        standalone: false,
        enableSubtasks
      });

      // Setup sync between VS Code TodoManager and standalone manager
      const vscodeManager = TodoManager.getInstance();

      // For non-standalone mode, we need to create a standalone manager for the server
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      // Always use WorkspaceStateStorage for MCP
      console.log('[MCPProvider] Using WorkspaceStateStorage');
      const storage: ITodoStorage = new WorkspaceStateStorage(this.context);

      const standaloneManager = StandaloneTodoManager.getInstance(storage);

      // Setup sync BEFORE starting the server to ensure we capture all events
      this.todoSync = new TodoSync(vscodeManager, standaloneManager);

      this.server.setTodoManager(standaloneManager);
      this.server.setTodoSync(this.todoSync);

      // Start the server (this will call initialize internally)
      await this.server.start();

      // Setup workspace roots handling
      this.setupWorkspaceRoots();

      // Setup configuration change handling
      this.setupConfigurationHandling();

      console.log(`MCP Todo Server started on port ${this.serverPort}`);
    });
  }

  private async findAvailablePort(): Promise<number> {
    return PerformanceMonitor.measure('findAvailablePort', () => {
      return new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
          const port = (server.address() as net.AddressInfo).port;
          server.close(() => resolve(port));
        });
        server.on('error', reject);
      });
    });
  }

  private setupWorkspaceRoots(): void {
    // Set initial workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot && this.server) {
      this.server.setWorkspaceRoot(workspaceRoot);
    }

    // Update on workspace folder changes
    const disposable = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      const newRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (newRoot && this.server) {
        this.server.setWorkspaceRoot(newRoot);
      }
    });

    this.context.subscriptions.push(disposable);
  }

  private setupConfigurationHandling(): void {
    // Listen for configuration changes from VS Code settings
    const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('agentTodos')) {
        // Auto-inject setting changed - no need to change storage
        // Storage remains WorkspaceStateStorage, only export behavior changes

        // Notify that server definitions might have changed
        // (tools availability may have changed)
        this._onDidChangeMcpServerDefinitions.fire();
      }
    });

    // Also listen for configuration changes from TodoManager
    const todoManager = TodoManager.getInstance();
    const todoConfigDisposable = todoManager.onDidChangeConfiguration((config) => {
      if (this.server) {
        // Broadcast configuration change to MCP server
        this.server.broadcastUpdate({
          type: 'configuration-changed',
          config: {
            autoInject: config.autoInject,
            enableSubtasks: config.enableSubtasks
          },
          timestamp: Date.now()
        });

        // No need to update storage - it remains WorkspaceStateStorage
      }

      // Notify that server definitions might have changed
      this._onDidChangeMcpServerDefinitions.fire();
    });

    this.context.subscriptions.push(configDisposable, todoConfigDisposable);
  }


  async dispose(): Promise<void> {
    if (this.todoSync) {
      this.todoSync.dispose();
      this.todoSync = null;
    }
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    this._onDidChangeMcpServerDefinitions.dispose();
  }

  getServerUrl(): string {
    return `http://localhost:${this.serverPort}`;
  }

  getServer(): TodoMCPServer | null {
    return this.server;
  }
}