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

		// Function to update toggle command titles based on current settings
		const updateToggleCommandTitles = () => {
			const config = vscode.workspace.getConfiguration('todoManager');
			const autoInjectEnabled = config.get<boolean>('autoInject', false);
			const autoOpenViewEnabled = config.get<boolean>('autoOpenView', true);

			// We can't directly update command titles, but we can show the state in the menu
			// This is handled via the when clauses in package.json and updated icons
		};

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

		// Set initial title immediately after creation
		treeView.title = todoManager.getTitle();

		// Set initial badge
		const updateBadge = () => {
			const notCompletedCount = todoManager.getNotCompletedCount();
			if (notCompletedCount > 0) {
				treeView.badge = {
					value: notCompletedCount,
					tooltip: `${notCompletedCount} task${notCompletedCount === 1 ? '' : 's'} remaining`
				};
			} else {
				treeView.badge = undefined;
			}
		};
		updateBadge();

		// Listen for changes to update title and badge
		todoManager.onDidChange((change) => {
			treeView.title = change.title;
			updateBadge();
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

		// Initialize MCP server provider asynchronously
		let mcpProvider: TodoMCPServerProvider | undefined;
		let mcpDisposable: vscode.Disposable | undefined;

		// Start MCP initialization in background
		setImmediate(async () => {
			try {
				mcpProvider = new TodoMCPServerProvider(context);

				// Register MCP server provider - check if API is available
				if (vscode.lm && typeof vscode.lm.registerMcpServerDefinitionProvider === 'function') {
					mcpDisposable = vscode.lm.registerMcpServerDefinitionProvider(
						'todos-mcp-provider',
						mcpProvider
					);
					context.subscriptions.push(mcpDisposable);
				} else {
					console.log('MCP API not available in this VS Code version');
				}

				// Start server asynchronously
				mcpProvider.ensureServerStarted().catch(error => {
					console.error('Failed to start MCP server:', error);
				});

				if (mcpProvider) {
					context.subscriptions.push(mcpProvider);
				}
			} catch (mcpError) {
				console.error('Failed to initialize MCP server:', mcpError);
				// Continue without MCP - the extension can still work with just the UI
			}
		});

		// Register commands
		const clearTodosCommand = vscode.commands.registerCommand('todoManager.clearTodos', async () => {
			await todoManager.clearTodos();
			vscode.window.showInformationMessage('All todos cleared!');
		});

		const refreshTodosCommand = vscode.commands.registerCommand('todoManager.refreshTodos', () => {
			treeDataProvider.refresh();
			decorationProvider.refresh();
			vscode.window.showInformationMessage('Todos refreshed!');
		});

		// Command to refresh decorations only (used internally)
		const refreshDecorationsCommand = vscode.commands.registerCommand('todoManager.refreshDecorations', () => {
			decorationProvider.refresh();
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

		const toggleAutoInjectEnabledCommand = vscode.commands.registerCommand('todoManager.toggleAutoInjectEnabled', async () => {
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

		const toggleAutoOpenViewEnabledCommand = vscode.commands.registerCommand('todoManager.toggleAutoOpenViewEnabled', async () => {
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
				await todoManager.deleteSubtask(item.parentTodoId, item.subtask.id);
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

		const startPlanningCommand = vscode.commands.registerCommand('todoManager.startPlanning', async () => {
			// Open chat with a planning prompt
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				mode: 'agent',
				query: 'Create a detailed plan to implement ...'
			});
		});

		// Add all disposables to context
		context.subscriptions.push(
			treeView,
			decorationProviderDisposable,
			clearTodosCommand,
			refreshTodosCommand,
			refreshDecorationsCommand,
			toggleTodoStatusCommand,
			deleteTodoCommand,
			toggleAutoInjectCommand,
			toggleAutoInjectEnabledCommand,
			toggleAutoOpenViewCommand,
			toggleAutoOpenViewEnabledCommand,
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
			runTodoCommand,
			startPlanningCommand
		);

		// MCP disposables are now added in the async initialization

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
