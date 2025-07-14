import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServer } from '../../mcp/server';
import { TodoMCPServerProvider } from '../../mcp/mcpProvider';
import { TodoManager } from '../../todoManager';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import { StandaloneTodoManager } from '../../mcp/standaloneTodoManager';

suite('MCP Settings Values Verification', () => {
    let server: TodoMCPServer;
    let provider: TodoMCPServerProvider;
    let todoManager: TodoManager;
    let context: vscode.ExtensionContext;

    setup(async function() {
        this.timeout(10000);
        
        // Mock context with workspaceState
        const workspaceState = new Map<string, any>();
        context = {
            subscriptions: [],
            workspaceState: {
                get: (key: string) => workspaceState.get(key),
                update: async (key: string, value: any) => {
                    workspaceState.set(key, value);
                }
            }
        } as any;
        
        todoManager = TodoManager.getInstance();
        await todoManager.clearTodos();
        
        // Start MCP provider (which starts the server)
        provider = new TodoMCPServerProvider(context);
        await provider.ensureServerStarted();
        server = provider.getServer()!;
        
        // Give everything time to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    teardown(async () => {
        await provider?.dispose();
        await todoManager?.clearTodos();
    });

    test('VS Code settings reach MCP server on initialization', async () => {
        // Get current VS Code configuration
        const config = vscode.workspace.getConfiguration('agentTodos');
        const vsCodeAutoInject = config.get<boolean>('autoInject', false);
        const vsCodeEnableSubtasks = config.get<boolean>('enableSubtasks', true);
        const vsCodeAutoInjectFilePath = config.get<string>('autoInjectFilePath', '.github/copilot-instructions.md');

        console.log('[Test] VS Code settings:', {
            autoInject: vsCodeAutoInject,
            enableSubtasks: vsCodeEnableSubtasks,
            autoInjectFilePath: vsCodeAutoInjectFilePath
        });

        // Get MCP server configuration
        const serverConfig = server.getConfig();
        console.log('[Test] MCP server config:', {
            autoInject: serverConfig.autoInject,
            enableSubtasks: serverConfig.enableSubtasks,
            autoInjectFilePath: serverConfig.autoInjectFilePath,
            standalone: serverConfig.standalone
        });

        // Verify settings match
        assert.strictEqual(serverConfig.autoInject, vsCodeAutoInject, 
            `autoInject mismatch: VS Code=${vsCodeAutoInject}, MCP=${serverConfig.autoInject}`);
        assert.strictEqual(serverConfig.enableSubtasks, vsCodeEnableSubtasks,
            `enableSubtasks mismatch: VS Code=${vsCodeEnableSubtasks}, MCP=${serverConfig.enableSubtasks}`);
        assert.strictEqual(serverConfig.autoInjectFilePath, vsCodeAutoInjectFilePath,
            `autoInjectFilePath mismatch: VS Code=${vsCodeAutoInjectFilePath}, MCP=${serverConfig.autoInjectFilePath}`);
    });

    test('todo_read tool visibility matches VS Code autoInject setting', async () => {
        // Ensure we have todos so todo_read could potentially be visible
        await todoManager.updateTodos([{
            id: 'test-1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }]);
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get current autoInject setting
        const config = vscode.workspace.getConfiguration('agentTodos');
        const autoInject = config.get<boolean>('autoInject', false);

        console.log('[Test] Current autoInject setting:', autoInject);

        // Get available tools
        const tools = await server.getTodoTools().getAvailableTools();
        const hasReadTool = tools.some(t => t.name === 'todo_read');

        console.log('[Test] Available tools:', tools.map(t => t.name));
        console.log('[Test] Has todo_read tool:', hasReadTool);

        // If autoInject is false, todo_read should be available (since we have todos)
        // If autoInject is true, todo_read should NOT be available
        if (autoInject) {
            assert.ok(!hasReadTool, 'todo_read should NOT be available when autoInject is enabled');
        } else {
            assert.ok(hasReadTool, 'todo_read should be available when autoInject is disabled and todos exist');
        }
    });

    test('Settings changes propagate to MCP server', async () => {
        // Get initial state
        const config = vscode.workspace.getConfiguration('agentTodos');
        const initialAutoInject = config.get<boolean>('autoInject', false);
        
        console.log('[Test] Initial autoInject:', initialAutoInject);

        // Toggle the setting
        const newAutoInject = !initialAutoInject;
        await config.update('autoInject', newAutoInject, vscode.ConfigurationTarget.Workspace);
        
        // Give time for change to propagate
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check if server config was updated
        const serverConfig = server.getConfig();
        console.log('[Test] Server config after change:', {
            autoInject: serverConfig.autoInject,
            expected: newAutoInject
        });

        assert.strictEqual(serverConfig.autoInject, newAutoInject,
            `Server autoInject should be updated to ${newAutoInject} but is ${serverConfig.autoInject}`);

        // Reset the setting
        await config.update('autoInject', initialAutoInject, vscode.ConfigurationTarget.Workspace);
        await new Promise(resolve => setTimeout(resolve, 300));
    });

    test('Tool schemas reflect current settings', async () => {
        // Ensure subtasks are enabled
        const config = vscode.workspace.getConfiguration('agentTodos');
        await config.update('enableSubtasks', true, vscode.ConfigurationTarget.Workspace);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Get tools and check schema
        let tools = await server.getTodoTools().getAvailableTools();
        let writeTool = tools.find(t => t.name === 'todo_write');
        
        assert.ok(writeTool, 'Write tool should exist');
        assert.ok(writeTool.inputSchema.properties.todos.items.properties.subtasks,
            'Schema should include subtasks when enabled');

        // Disable subtasks
        await config.update('enableSubtasks', false, vscode.ConfigurationTarget.Workspace);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check schema again
        tools = await server.getTodoTools().getAvailableTools();
        writeTool = tools.find(t => t.name === 'todo_write');
        
        assert.ok(writeTool, 'Write tool should still exist');
        assert.ok(!writeTool.inputSchema.properties.todos.items.properties.subtasks,
            'Schema should NOT include subtasks when disabled');

        // Reset
        await config.update('enableSubtasks', true, vscode.ConfigurationTarget.Workspace);
    });

    test('Direct configuration access from TodoTools', async () => {
        // Test that TodoTools can access server configuration correctly
        const todoTools = server.getTodoTools();
        
        // Get current VS Code settings
        const config = vscode.workspace.getConfiguration('agentTodos');
        const vsCodeAutoInject = config.get<boolean>('autoInject', false);
        const vsCodeEnableSubtasks = config.get<boolean>('enableSubtasks', true);

        // Test internal methods (accessing private methods for debugging)
        const isAutoInjectEnabled = (todoTools as any).isAutoInjectEnabled();
        const isSubtasksEnabled = (todoTools as any).isSubtasksEnabled();

        console.log('[Test] TodoTools internal state:', {
            isAutoInjectEnabled,
            isSubtasksEnabled,
            vsCodeAutoInject,
            vsCodeEnableSubtasks
        });

        assert.strictEqual(isAutoInjectEnabled, vsCodeAutoInject,
            `TodoTools autoInject should match VS Code setting: ${vsCodeAutoInject}`);
        assert.strictEqual(isSubtasksEnabled, vsCodeEnableSubtasks,
            `TodoTools subtasks should match VS Code setting: ${vsCodeEnableSubtasks}`);
    });

    test('Configuration broadcast mechanism', async () => {
        let broadcastCalled = false;
        let broadcastEvent: any = null;

        // Intercept broadcastUpdate calls
        const originalBroadcast = server.broadcastUpdate.bind(server);
        server.broadcastUpdate = function(event: any) {
            broadcastCalled = true;
            broadcastEvent = event;
            console.log('[Test] Broadcast intercepted:', event);
            return originalBroadcast(event);
        };

        // Change a setting via TodoManager (this should trigger broadcast)
        const todoManagerConfig = TodoManager.getInstance();
        const config = vscode.workspace.getConfiguration('agentTodos');
        
        // Toggle autoInject
        const currentAutoInject = config.get<boolean>('autoInject', false);
        await config.update('autoInject', !currentAutoInject, vscode.ConfigurationTarget.Workspace);
        
        // Give time for broadcast
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log('[Test] Broadcast status:', {
            broadcastCalled,
            broadcastEvent
        });

        assert.ok(broadcastCalled, 'broadcastUpdate should have been called');
        assert.ok(broadcastEvent, 'Broadcast event should exist');
        
        if (broadcastEvent) {
            assert.strictEqual(broadcastEvent.type, 'configuration-changed',
                'Broadcast should be configuration-changed type');
            assert.ok(broadcastEvent.config, 'Broadcast should include config object');
            assert.strictEqual(typeof broadcastEvent.config.autoInject, 'boolean',
                'Broadcast config should include autoInject');
        }

        // Reset
        await config.update('autoInject', currentAutoInject, vscode.ConfigurationTarget.Workspace);
    });
});
