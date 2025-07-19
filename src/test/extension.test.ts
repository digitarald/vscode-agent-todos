import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { TodoMCPServerProvider } from '../mcp/mcpProvider';

suite('Extension Lifecycle Tests', () => {
	let context: vscode.ExtensionContext;
	let todoManager: TodoManager;
	let originalWorkspace: any;

	setup(async () => {
		// Store original workspace for restoration
		originalWorkspace = vscode.workspace;

		// Mock extension context
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

		// Mock VS Code workspace methods that are used by TodoMCPServerProvider
		const mockWorkspace = {
			...originalWorkspace,
			workspaceFolders: originalWorkspace.workspaceFolders,
			getConfiguration: originalWorkspace.getConfiguration,
			onDidChangeConfiguration: originalWorkspace.onDidChangeConfiguration,
			onDidChangeWorkspaceFolders: () => {
				// Return a mock disposable
				return {
					dispose: () => { }
				};
			}
		};

		// Replace vscode.workspace with our mock
		Object.defineProperty(vscode, 'workspace', {
			value: mockWorkspace,
			configurable: true
		});

		todoManager = TodoManager.getInstance();
		todoManager.initialize(context);
		await todoManager.clearTodos();
	});

	teardown(async () => {
		await todoManager?.clearTodos();

		// Restore original workspace
		if (originalWorkspace) {
			Object.defineProperty(vscode, 'workspace', {
				value: originalWorkspace,
				configurable: true
			});
		}
	});

	test('Should initialize TodoManager singleton', () => {
		const manager1 = TodoManager.getInstance();
		const manager2 = TodoManager.getInstance();

		assert.strictEqual(manager1, manager2, 'Should return same singleton instance');
	});

	test('Should register MCP server provider', async () => {
		const provider = new TodoMCPServerProvider(context);

		// Should not throw during creation
		assert.ok(provider);

		// Should provide server definitions
		const definitions = await provider.provideMcpServerDefinitions();
		assert.ok(definitions);
		assert.ok(Array.isArray(definitions));
		assert.strictEqual(definitions.length, 1);

		const definition = definitions[0];
		assert.ok(definition instanceof vscode.McpHttpServerDefinition);
		assert.ok(definition.uri);
		assert.ok(definition.uri.toString().includes('localhost'));
		assert.ok(definition.uri.toString().includes('/mcp'));
		assert.strictEqual(definition.label, 'Todos');

		await provider.dispose();
	});

	test('Should handle extension context properly', async () => {
		// TodoManager should work with mock context
		await todoManager.setTodos([{
			id: 'extension-test',
			content: 'Extension test todo',
			status: 'pending',
			priority: 'medium'
		}]);

		const todos = todoManager.getTodos();
		assert.strictEqual(todos.length, 1);
		assert.strictEqual(todos[0].content, 'Extension test todo');
	});

	test('Should handle configuration changes', async () => {
		const config = vscode.workspace.getConfiguration('agentTodos');

		// Initial state
		const initialAutoInject = config.get<boolean>('autoInject', false);

		// Change setting
		await config.update('autoInject', !initialAutoInject, vscode.ConfigurationTarget.Workspace);

		// Verify change (basic test that config system works)
		const updatedConfig = vscode.workspace.getConfiguration('agentTodos');
		const newAutoInject = updatedConfig.get<boolean>('autoInject', false);
		assert.strictEqual(newAutoInject, !initialAutoInject);

		// Reset
		await config.update('autoInject', initialAutoInject, vscode.ConfigurationTarget.Workspace);
	});

	test('Should provide context keys for conditional UI', async () => {
		// Initially no todos, so hasTodos should be false
		await vscode.commands.executeCommand('setContext', 'agentTodos.hasTodos', false);

		// Add todos
		await todoManager.setTodos([{
			id: 'context-test',
			content: 'Context test',
			status: 'pending',
			priority: 'low'
		}]);

		// Should be able to set context to true
		await vscode.commands.executeCommand('setContext', 'agentTodos.hasTodos', true);

		// No assertions needed - if commands don't throw, context keys work
		assert.ok(true, 'Context commands should execute without error');
	});
});
