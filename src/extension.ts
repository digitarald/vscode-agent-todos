import * as vscode from 'vscode';
import { TodoManager } from './todoManager';
import { TodoTreeDataProvider, TodoDecorationProvider } from './todoTreeProvider';
import { SubtaskManager } from './subtaskManager';
import { TodoMCPServerProvider } from './mcp/mcpProvider';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Todos extension is now active!');

	try {
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

	// Initialize MCP server provider
	let mcpProvider: TodoMCPServerProvider | undefined;
	let mcpDisposable: vscode.Disposable | undefined;
	
	try {
		mcpProvider = new TodoMCPServerProvider(context);
		
		// Register MCP server provider - check if API is available
		if (vscode.lm && typeof vscode.lm.registerMcpServerDefinitionProvider === 'function') {
			mcpDisposable = vscode.lm.registerMcpServerDefinitionProvider(
				'todos-mcp-provider',
				mcpProvider
			);
		} else {
			console.log('MCP API not available in this VS Code version');
		}
		
		// Wait for server to start
		await mcpProvider.ensureServerStarted();
	} catch (mcpError) {
		console.error('Failed to initialize MCP server:', mcpError);
		// Continue without MCP - the extension can still work with just the UI
	}

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

	const toggleTodoStatusCommand = vscode.commands.registerCommand('todoManager.toggleTodoStatus', async (item: any) => {
		// Handle both direct call with todoId and tree item call
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.toggleTodoStatus(todoId);
		}
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

	// Subtask commands
	const addSubtaskCommand = vscode.commands.registerCommand('todoManager.addSubtask', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			const content = await vscode.window.showInputBox({
				prompt: 'Enter subtask description',
				placeHolder: 'Subtask description'
			});
			if (content) {
				const subtaskId = SubtaskManager.generateSubtaskId(content);
				await todoManager.addSubtask(todoId, {
					id: subtaskId,
					content,
					status: 'pending'
				});
			}
		}
	});

	const toggleSubtaskCommand = vscode.commands.registerCommand('todoManager.toggleSubtask', async (item: any) => {
		if (item?.subtask && item?.parentTodoId) {
			await todoManager.toggleSubtaskStatus(item.parentTodoId, item.subtask.id);
		}
	});

	const deleteSubtaskCommand = vscode.commands.registerCommand('todoManager.deleteSubtask', async (item: any) => {
		if (item?.subtask && item?.parentTodoId) {
			const selection = await vscode.window.showInformationMessage('Delete this subtask?', 'Yes', 'No');
			if (selection === 'Yes') {
				await todoManager.deleteSubtask(item.parentTodoId, item.subtask.id);
			}
		}
	});

	// Details commands
	const addEditDetailsCommand = vscode.commands.registerCommand('todoManager.addEditDetails', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			const todo = todoManager.getTodos().find(t => t.id === todoId);
			const currentDetails = todo?.details || '';
			const details = await vscode.window.showInputBox({
				prompt: 'Enter implementation details or notes',
				placeHolder: 'Implementation details',
				value: currentDetails,
				validateInput: (value) => {
					if (value.length > 500) {
						return 'Details must be less than 500 characters';
					}
					return null;
				}
			});
			if (details !== undefined) {
				await todoManager.setTodoDetails(todoId, details);
			}
		}
	});

	const clearDetailsCommand = vscode.commands.registerCommand('todoManager.clearDetails', async (item: any) => {
		const todoId = typeof item === 'string' ? item : item?.todo?.id;
		if (todoId) {
			await todoManager.setTodoDetails(todoId, undefined);
		}
	});

	const runTodoCommand = vscode.commands.registerCommand('todoManager.runTodo', async (item: any) => {
		const todo = item?.todo;
		if (todo) {
			// Set the todo status to in-progress
			await todoManager.setTodoStatus(todo.id, 'in_progress');
			
			let query = `Continue todos with step _${todo.content}_`;

			// Execute the chat command with agent mode
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				mode: 'agent',
				query: query
			});
		}
	});

	// Add all disposables to context
	context.subscriptions.push(
		treeView,
		decorationProviderDisposable,
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
		setPriorityLowCommand,
		addSubtaskCommand,
		toggleSubtaskCommand,
		deleteSubtaskCommand,
		addEditDetailsCommand,
		clearDetailsCommand,
		runTodoCommand
	);
	
	// Add MCP disposables if they were initialized successfully
	if (mcpDisposable) {
		context.subscriptions.push(mcpDisposable);
	}
	if (mcpProvider) {
		context.subscriptions.push(mcpProvider);
	}

	// Initialize todos from storage or instructions file
	// The TodoManager will automatically sync from instructions file if auto-inject is enabled
	} catch (error) {
		console.error('Failed to activate Todos extension:', error);
		vscode.window.showErrorMessage(`Failed to activate Todos extension: ${error instanceof Error ? error.message : String(error)}`);
		throw error; // Re-throw to let VS Code know activation failed
	}
}

export function deactivate() {
	const todoManager = TodoManager.getInstance();
	todoManager.dispose();
}
