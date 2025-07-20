import * as vscode from 'vscode';
import { TodoManager } from './todoManager';
import { TodoTreeDataProvider, TodoDecorationProvider } from './todoTreeProvider';
import { TodoMCPServerProvider } from './mcp/mcpProvider';
import { TodoMarkdownFormatter } from './utils/todoMarkdownFormatter';
import { TelemetryManager } from './telemetryManager';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Todos extension is now active!');

	try {
		// Initialize telemetry
		const telemetryManager = TelemetryManager.getInstance();
		telemetryManager.initialize(context);
		telemetryManager.sendEvent('extension.activate', {
			extensionVersion: context.extension.packageJSON.version || 'unknown'
		});

		// Initialize todo manager
		const todoManager = TodoManager.getInstance();
		todoManager.initialize(context);


		// Register file decoration provider for todo styling
		const decorationProvider = new TodoDecorationProvider();
		const decorationProviderDisposable = vscode.window.registerFileDecorationProvider(decorationProvider);

		// Create tree data provider and tree view
		const treeDataProvider = new TodoTreeDataProvider();
		const treeView = vscode.window.createTreeView('agentTodos', {
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

		// Set initial context key for non-empty todos
		const updateContextKeys = () => {
			const hasTodos = todoManager.getTodos().length > 0;
			vscode.commands.executeCommand('setContext', 'agentTodos.hasTodos', hasTodos);
		};
		updateContextKeys();

		// Listen for changes to update title and badge
		todoManager.onDidChange((change) => {
			treeView.title = change.title;
			updateBadge();
			// Update context key for non-empty todos
			const hasTodos = change.todos.length > 0;
			vscode.commands.executeCommand('setContext', 'agentTodos.hasTodos', hasTodos);
		});

		// Listen for auto-open view events
		todoManager.onShouldOpenView(async () => {
			// Get the first todo item to reveal (if any)
			const todos = todoManager.getTodos();
			if (todos.length > 0) {
				// Show the tree view by focusing on the Todos panel
				await vscode.commands.executeCommand('agentTodos.focus');
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
						'digitarald.agent-todos.mcp-provider',
						mcpProvider
					);
					context.subscriptions.push(mcpDisposable);
					telemetryManager.sendEvent('mcp.provider.registered');
				} else {
					console.log('MCP API not available in this VS Code version');
					telemetryManager.sendEvent('mcp.api.unavailable');
				}

				// Start server asynchronously
				mcpProvider.ensureServerStarted().then(() => {
					telemetryManager.sendEvent('mcp.server.started');
				}).catch(error => {
					console.error('Failed to start MCP server:', error);
					telemetryManager.sendError(error instanceof Error ? error : new Error(String(error)), {
						phase: 'mcp.server.start'
					});
				});

				if (mcpProvider) {
					context.subscriptions.push(mcpProvider);
				}
			} catch (mcpError) {
				console.error('Failed to initialize MCP server:', mcpError);
				telemetryManager.sendError(mcpError instanceof Error ? mcpError : new Error(String(mcpError)), {
					phase: 'mcp.initialization'
				});
				// Continue without MCP - the extension can still work with just the UI
			}
		});

		// Register commands
		const clearTodosCommand = vscode.commands.registerCommand('agentTodos.clearTodos', async () => {
			try {
				const todoCount = todoManager.getTodos().length;
				await todoManager.clearTodos();
				vscode.window.showInformationMessage('All todos cleared!');
				
				telemetryManager.sendEvent('command.clearTodos', {}, {
					todoCount: todoCount
				});
			} catch (error) {
				telemetryManager.sendError(error instanceof Error ? error : new Error(String(error)), {
					command: 'clearTodos'
				});
				throw error;
			}
		});

		// Manual refresh command - rarely needed due to automatic refresh mechanism
		// Useful for edge cases: external storage modifications, extension crashes, API failures, or debugging
		const refreshTodosCommand = vscode.commands.registerCommand('agentTodos.refreshTodos', () => {
			treeDataProvider.refresh();
			decorationProvider.refresh();
		});

		// Command to refresh decorations only (used internally)
		const refreshDecorationsCommand = vscode.commands.registerCommand('agentTodos.refreshDecorations', () => {
			decorationProvider.refresh();
		});

		const toggleTodoStatusCommand = vscode.commands.registerCommand('agentTodos.toggleTodoStatus', async (item: any) => {
			// Handle both direct call with todoId and tree item call
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.toggleTodoStatus(todoId);
			}
		});

		const deleteTodoCommand = vscode.commands.registerCommand('agentTodos.deleteTodo', async (item: any) => {
			// Handle both direct call with todoId and tree item call
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.deleteTodo(todoId);
			}
		});

		const toggleAutoInjectCommand = vscode.commands.registerCommand('agentTodos.toggleAutoInject', async () => {
			try {
				const config = vscode.workspace.getConfiguration('agentTodos');
				const currentValue = config.get<boolean>('autoInject', false);
				await config.update('autoInject', !currentValue, vscode.ConfigurationTarget.Workspace);

				const status = !currentValue ? 'enabled' : 'disabled';
				vscode.window.showInformationMessage(`Auto-inject ${status}. Todo list will ${!currentValue ? 'now be automatically injected into' : 'be removed from'} instructions file`);
				
				telemetryManager.sendEvent('command.toggleAutoInject', {
					newValue: String(!currentValue)
				});
			} catch (error) {
				telemetryManager.sendError(error instanceof Error ? error : new Error(String(error)), {
					command: 'toggleAutoInject'
				});
				throw error;
			}
		});

		const toggleAutoInjectEnabledCommand = vscode.commands.registerCommand('agentTodos.toggleAutoInjectEnabled', async () => {
			const config = vscode.workspace.getConfiguration('agentTodos');
			const currentValue = config.get<boolean>('autoInject', false);
			await config.update('autoInject', !currentValue, vscode.ConfigurationTarget.Workspace);

			const status = !currentValue ? 'enabled' : 'disabled';
			vscode.window.showInformationMessage(`Auto-inject ${status}. Todo list will ${!currentValue ? 'now be automatically injected into' : 'be removed from'} instructions file`);
		});

		const toggleAutoOpenViewCommand = vscode.commands.registerCommand('agentTodos.toggleAutoOpenView', async () => {
			const config = vscode.workspace.getConfiguration('agentTodos');
			const currentValue = config.get<boolean>('autoOpenView', true);
			await config.update('autoOpenView', !currentValue, vscode.ConfigurationTarget.Workspace);

			const status = !currentValue ? 'enabled' : 'disabled';
			vscode.window.showInformationMessage(`Auto-open view ${status}. The Todos view will ${!currentValue ? 'automatically open' : 'not open'} when the todo list changes.`);
		});

		const toggleAutoOpenViewEnabledCommand = vscode.commands.registerCommand('agentTodos.toggleAutoOpenViewEnabled', async () => {
			const config = vscode.workspace.getConfiguration('agentTodos');
			const currentValue = config.get<boolean>('autoOpenView', true);
			await config.update('autoOpenView', !currentValue, vscode.ConfigurationTarget.Workspace);

			const status = !currentValue ? 'enabled' : 'disabled';
			vscode.window.showInformationMessage(`Auto-open view ${status}. The Todos view will ${!currentValue ? 'automatically open' : 'not open'} when the todo list changes.`);
		});

		// Status commands
		const setStatusPendingCommand = vscode.commands.registerCommand('agentTodos.setStatusPending', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoStatus(todoId, 'pending');
			}
		});

		const setStatusInProgressCommand = vscode.commands.registerCommand('agentTodos.setStatusInProgress', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoStatus(todoId, 'in_progress');
			}
		});

		const setStatusCompletedCommand = vscode.commands.registerCommand('agentTodos.setStatusCompleted', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoStatus(todoId, 'completed');
			}
		});

		// Priority commands
		const setPriorityHighCommand = vscode.commands.registerCommand('agentTodos.setPriorityHigh', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoPriority(todoId, 'high');
			}
		});

		const setPriorityMediumCommand = vscode.commands.registerCommand('agentTodos.setPriorityMedium', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoPriority(todoId, 'medium');
			}
		});

		const setPriorityLowCommand = vscode.commands.registerCommand('agentTodos.setPriorityLow', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoPriority(todoId, 'low');
			}
		});

		// ADR commands
		const addEditAdrCommand = vscode.commands.registerCommand('agentTodos.addEditAdr', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				const todo = todoManager.getTodos().find(t => t.id === todoId);
				const currentAdr = todo?.adr || '';
				const adr = await vscode.window.showInputBox({
					prompt: 'Enter architecture decisions or implementation rationale',
					placeHolder: 'Architecture Decision Record',
					value: currentAdr,
					validateInput: (value) => {
						if (value.length > 500) {
							return 'ADR must be less than 500 characters';
						}
						return null;
					}
				});
				if (adr !== undefined) {
					await todoManager.setTodoAdr(todoId, adr);
				}
			}
		});

		const clearAdrCommand = vscode.commands.registerCommand('agentTodos.clearAdr', async (item: any) => {
			const todoId = typeof item === 'string' ? item : item?.todo?.id;
			if (todoId) {
				await todoManager.setTodoAdr(todoId, undefined);
			}
		});

		const runTodoCommand = vscode.commands.registerCommand('agentTodos.runTodo', async (item: any) => {
			try {
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
					
					telemetryManager.sendEvent('command.runTodo', {
						todoStatus: todo.status,
						todoPriority: todo.priority || 'none'
					});
				}
			} catch (error) {
				telemetryManager.sendError(error instanceof Error ? error : new Error(String(error)), {
					command: 'runTodo'
				});
				throw error;
			}
		});

		const startPlanningCommand = vscode.commands.registerCommand('agentTodos.startPlanning', async () => {
			// Open chat with a planning prompt
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				mode: 'agent',
				query: 'Create a detailed plan to implement ...',
				isPartialQuery: true
			});
		});

		// Save todos to markdown file
		const saveTodosCommand = vscode.commands.registerCommand('agentTodos.saveTodos', async () => {
			const todos = todoManager.getTodos();
			const title = todoManager.getBaseTitle();
			
			if (todos.length === 0) {
				vscode.window.showWarningMessage('No todos to save');
				return;
			}
			
			const defaultFileName = 'todo.md';
			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(defaultFileName),
				filters: {
					'Markdown': ['md'],
					'All Files': ['*']
				},
				saveLabel: 'Save Todos'
			});
			
			if (!saveUri) {
				return; // User cancelled
			}
			
			try {
				const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(todos, title);
				const content = Buffer.from(markdown, 'utf8');
				await vscode.workspace.fs.writeFile(saveUri, content);
				vscode.window.showInformationMessage(`Todos saved to ${saveUri.fsPath}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to save todos: ${error}`);
			}
		});

		// Load todos from markdown file
		const loadTodosCommand = vscode.commands.registerCommand('agentTodos.loadTodos', async () => {
			const openUri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: {
					'Markdown': ['md'],
					'All Files': ['*']
				},
				openLabel: 'Load Todos'
			});
			
			if (!openUri || openUri.length === 0) {
				return; // User cancelled
			}
			
			try {
				const fileContent = await vscode.workspace.fs.readFile(openUri[0]);
				const content = Buffer.from(fileContent).toString('utf8');
				
				const { todos: parsedTodos, title } = TodoMarkdownFormatter.parseMarkdown(content);
				const validatedTodos = TodoMarkdownFormatter.validateAndSanitizeTodos(parsedTodos);
				
				if (validatedTodos.length === 0) {
					vscode.window.showWarningMessage('No valid todos found in the file');
					return;
				}
				
				// Ask for confirmation before replacing
				const currentTodos = todoManager.getTodos();
				if (currentTodos.length > 0) {
					const choice = await vscode.window.showWarningMessage(
						`This will replace ${currentTodos.length} existing todo(s) with ${validatedTodos.length} todo(s) from the file. Continue?`,
						'Yes', 'No'
					);
					
					if (choice !== 'Yes') {
						return;
					}
				}
				
				await todoManager.setTodos(validatedTodos, title || 'Todos');
				vscode.window.showInformationMessage(`Loaded ${validatedTodos.length} todo(s) from ${openUri[0].fsPath}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to load todos: ${error}`);
			}
		});

		// Show history command - displays saved todo lists in a quick pick
		const showHistoryCommand = vscode.commands.registerCommand('agentTodos.showHistory', async () => {
			const savedLists = todoManager.getSavedLists();
			
			if (savedLists.length === 0) {
				vscode.window.showInformationMessage('No saved todo lists found. Todo lists are automatically saved when you change the title.');
				return;
			}

			// Create quick pick items from saved lists
			const quickPickItems = savedLists.map(savedList => ({
				label: savedList.title,
				description: `${savedList.todos.length} todo(s)`,
				detail: `Saved on ${savedList.savedAt.toLocaleDateString()} at ${savedList.savedAt.toLocaleTimeString()}`,
				savedList: savedList
			}));

			const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select a saved todo list to load',
				title: 'Todo History'
			});

			if (!selectedItem) {
				return; // User cancelled
			}

			// Ask for confirmation before replacing current todos
			const currentTodos = todoManager.getTodos();
			if (currentTodos.length > 0) {
				const choice = await vscode.window.showWarningMessage(
					`This will replace ${currentTodos.length} existing todo(s) with ${selectedItem.savedList.todos.length} todo(s) from "${selectedItem.savedList.title}". Continue?`,
					'Yes', 'No'
				);
				
				if (choice !== 'Yes') {
					return;
				}
			}

			// Load the selected saved list
			await todoManager.setTodos(selectedItem.savedList.todos, selectedItem.savedList.title);
			vscode.window.showInformationMessage(`Loaded "${selectedItem.savedList.title}" with ${selectedItem.savedList.todos.length} todo(s)`);
		});

		// Open settings command
		const openSettingsCommand = vscode.commands.registerCommand('agentTodos.openSettings', async () => {
			await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:digitarald.agent-todos');
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
			addEditAdrCommand,
			clearAdrCommand,
			runTodoCommand,
			startPlanningCommand,
			saveTodosCommand,
			loadTodosCommand,
			showHistoryCommand,
			openSettingsCommand
		);

		// MCP disposables are now added in the async initialization

		// Initialize todos from storage or instructions file
		// The TodoManager will automatically sync from instructions file if auto-inject is enabled
	} catch (error) {
		console.error('Failed to activate Todos extension:', error);
		
		// Send error telemetry
		const telemetryManager = TelemetryManager.getInstance();
		if (error instanceof Error) {
			telemetryManager.sendError(error, { 
				phase: 'activation'
			});
		}
		
		vscode.window.showErrorMessage(`Failed to activate Todos extension: ${error instanceof Error ? error.message : String(error)}`);
		throw error; // Re-throw to let VS Code know activation failed
	}
}

export function deactivate() {
	try {
		const telemetryManager = TelemetryManager.getInstance();
		telemetryManager.sendEvent('extension.deactivate');
		
		const todoManager = TodoManager.getInstance();
		todoManager.dispose();
		
		// Dispose telemetry last
		telemetryManager.dispose();
	} catch (error) {
		console.error('Error during extension deactivation:', error);
	}
}
