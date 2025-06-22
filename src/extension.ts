import * as vscode from 'vscode';
import { TodoManager } from './todoManager';
import { TodoTreeDataProvider, TodoDecorationProvider } from './todoTreeProvider';
import { TodoReadTool, TodoWriteTool } from './languageModelTools';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Todos extension is now active!');

	// Initialize todo manager
	const todoManager = TodoManager.getInstance();
	todoManager.initialize(context);

	// Register file decoration provider for todo styling
	const decorationProvider = new TodoDecorationProvider();
	const decorationProviderDisposable = vscode.window.registerFileDecorationProvider(decorationProvider);

	// Create tree data provider and tree view
	const treeDataProvider = new TodoTreeDataProvider();
	const treeView = vscode.window.createTreeView('todoManager', {
		treeDataProvider: treeDataProvider,
		showCollapseAll: false,
		canSelectMany: false
	});


	// Set initial title
	treeView.title = todoManager.getTitle();

	// Listen for title changes
	todoManager.onDidChangeTitle((newTitle) => {
		treeView.title = newTitle;
	});

	// Listen for auto-open view events
	todoManager.onShouldOpenView(async () => {
		// Get the first todo item to reveal (if any)
		const todos = todoManager.getTodos();
		if (todos.length > 0) {
			// Show the tree view by focusing on the Todos panel
			await vscode.commands.executeCommand('todoManager.focus');
		}
	});

	// Register language model tools
	const todoReadTool = new TodoReadTool();
	const todoWriteTool = new TodoWriteTool();

	const readToolDisposable = vscode.lm.registerTool('todo_read', todoReadTool);
	const writeToolDisposable = vscode.lm.registerTool('todo_write', todoWriteTool);

	// Register commands
	const clearTodosCommand = vscode.commands.registerCommand('todoManager.clearTodos', async () => {
		const selection = await vscode.window.showInformationMessage('Are you sure you want to clear all todos?', 'Yes', 'No');
		if (selection === 'Yes') {
			await todoManager.clearTodos();
			vscode.window.showInformationMessage('All todos cleared!');
		}
	});

	const refreshTodosCommand = vscode.commands.registerCommand('todoManager.refreshTodos', () => {
		treeDataProvider.refresh();
		decorationProvider.refresh();
		vscode.window.showInformationMessage('Todos refreshed!');
	});

	const toggleTodoStatusCommand = vscode.commands.registerCommand('todoManager.toggleTodoStatus', async (todoId: string) => {
		await todoManager.toggleTodoStatus(todoId);
	});

	const deleteTodoCommand = vscode.commands.registerCommand('todoManager.deleteTodo', async (item: any) => {
		// Handle both direct call with todoId and tree item call
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.deleteTodo(todoId);
		}
	});

	const toggleAutoInjectCommand = vscode.commands.registerCommand('todoManager.toggleAutoInject', async () => {
		const config = vscode.workspace.getConfiguration('todoManager');
		const currentValue = config.get<boolean>('autoInject', false);
		await config.update('autoInject', !currentValue, vscode.ConfigurationTarget.Workspace);

		const status = !currentValue ? 'enabled' : 'disabled';
		vscode.window.showInformationMessage(`Auto-inject ${status}. Todo list will ${!currentValue ? 'now be automatically injected into' : 'be removed from'} .github/copilot-instructions.md`);
	});

	const toggleAutoOpenViewCommand = vscode.commands.registerCommand('todoManager.toggleAutoOpenView', async () => {
		const config = vscode.workspace.getConfiguration('todoManager');
		const currentValue = config.get<boolean>('autoOpenView', true);
		await config.update('autoOpenView', !currentValue, vscode.ConfigurationTarget.Workspace);

		const status = !currentValue ? 'enabled' : 'disabled';
		vscode.window.showInformationMessage(`Auto-open view ${status}. The Todos view will ${!currentValue ? 'automatically open' : 'not open'} when the todo list changes.`);
	});

	// Status commands
	const setStatusPendingCommand = vscode.commands.registerCommand('todoManager.setStatusPending', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoStatus(todoId, 'pending');
		}
	});

	const setStatusInProgressCommand = vscode.commands.registerCommand('todoManager.setStatusInProgress', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoStatus(todoId, 'in_progress');
		}
	});

	const setStatusCompletedCommand = vscode.commands.registerCommand('todoManager.setStatusCompleted', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoStatus(todoId, 'completed');
		}
	});

	// Priority commands
	const setPriorityHighCommand = vscode.commands.registerCommand('todoManager.setPriorityHigh', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoPriority(todoId, 'high');
		}
	});

	const setPriorityMediumCommand = vscode.commands.registerCommand('todoManager.setPriorityMedium', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoPriority(todoId, 'medium');
		}
	});

	const setPriorityLowCommand = vscode.commands.registerCommand('todoManager.setPriorityLow', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoPriority(todoId, 'low');
		}
	});

	// Add all disposables to context
	context.subscriptions.push(
		treeView,
		decorationProviderDisposable,
		readToolDisposable,
		writeToolDisposable,
		clearTodosCommand,
		refreshTodosCommand,
		toggleTodoStatusCommand,
		deleteTodoCommand,
		toggleAutoInjectCommand,
		toggleAutoOpenViewCommand,
		setStatusPendingCommand,
		setStatusInProgressCommand,
		setStatusCompletedCommand,
		setPriorityHighCommand,
		setPriorityMediumCommand,
		setPriorityLowCommand
	);

	// Initialize todos from storage or instructions file
	// The TodoManager will automatically sync from instructions file if auto-inject is enabled
}

export function deactivate() {
	const todoManager = TodoManager.getInstance();
	todoManager.dispose();
}
