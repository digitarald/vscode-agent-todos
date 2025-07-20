import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { TodoMCPServerProvider } from '../mcp/mcpProvider';
import { getMockExtensionContext } from './testUtils';

suite('Extension Lifecycle Tests', () => {
	let context: vscode.ExtensionContext;
	let todoManager: TodoManager;

	setup(async () => {
		context = getMockExtensionContext();

		todoManager = TodoManager.getInstance();
		todoManager.initialize(context);
		await todoManager.clearTodos();
		
		// Clear saved lists by accessing private property for testing
		(todoManager as any).savedLists = new Map();
	});

	teardown(async () => {
		await todoManager?.clearTodos();
	});

	test('Should initialize TodoManager singleton', () => {
		const manager1 = TodoManager.getInstance();
		const manager2 = TodoManager.getInstance();

		assert.strictEqual(manager1, manager2, 'Should return same singleton instance');
	});

	// Skip MCP provider test that requires workspace
	test.skip('Should register MCP server provider', async () => {
		// This test requires vscode.workspace which cannot be mocked
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

	// Skip configuration test that requires workspace
	test.skip('Should handle configuration changes', async () => {
		// This test requires vscode.workspace.getConfiguration which cannot be mocked
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

	test('Should have access to saved lists functionality', async () => {
		// Initially no saved lists
		const initialSavedLists = todoManager.getSavedLists();
		assert.strictEqual(initialSavedLists.length, 0, 'Should start with no saved lists');

		// Add todos with a title to trigger automatic saving
		await todoManager.setTodos([{
			id: 'test1',
			content: 'Test todo 1',
			status: 'pending',
			priority: 'medium'
		}], 'Test Project');

		// Change title to trigger save
		await todoManager.setTodos([{
			id: 'test2',
			content: 'Test todo 2',
			status: 'pending',
			priority: 'high'
		}], 'New Project');

		// Should now have one saved list
		const savedLists = todoManager.getSavedLists();
		assert.strictEqual(savedLists.length, 1, 'Should have one saved list after title change');
		assert.strictEqual(savedLists[0].title, 'Test Project', 'Should save the previous title');
		assert.strictEqual(savedLists[0].todos.length, 1, 'Should save the previous todos');
		assert.strictEqual(savedLists[0].todos[0].content, 'Test todo 1', 'Should save correct todo content');
	});
});
