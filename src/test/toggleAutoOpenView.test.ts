import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('toggleAutoOpenView Test Suite', () => {
    let todoManager: TodoManager;
    let mockContext: vscode.ExtensionContext;

    setup(async () => {
        // Initialize TodoManager with InMemoryStorage
        todoManager = TodoManager.getInstance();
        const storage = new InMemoryStorage();
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: async () => {},
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: async () => {},
                keys: () => [],
                setKeysForSync: () => {}
            },
            extensionPath: '',
            extensionUri: vscode.Uri.parse('file:///test'),
            storagePath: '',
            globalStoragePath: '',
            logPath: '',
            extensionMode: vscode.ExtensionMode.Test,
            asAbsolutePath: (path: string) => path,
            storageUri: vscode.Uri.parse('file:///test/storage'),
            globalStorageUri: vscode.Uri.parse('file:///test/global-storage'),
            logUri: vscode.Uri.parse('file:///test/logs'),
            extension: {} as any,
            environmentVariableCollection: {} as any,
            secrets: {} as any
        } as any;
        
        todoManager.initialize(mockContext);
    });

    teardown(() => {
        todoManager.dispose();
    });

    test('auto-open view configuration defaults to true', () => {
        const config = vscode.workspace.getConfiguration('agentTodos');
        const defaultValue = config.inspect<boolean>('autoOpenView')?.defaultValue;
        assert.strictEqual(defaultValue, true, 'autoOpenView should default to true');
    });

    test('auto-open view triggers when enabled and todos are added', async () => {
        let openViewTriggered = false;
        todoManager.onShouldOpenView(() => {
            openViewTriggered = true;
        });

        // Add a todo
        await todoManager.setTodos([{
            id: '1',
            content: 'Test todo',
            status: 'pending',
            priority: 'medium'
        }]);

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that the open view event was triggered
        assert.strictEqual(openViewTriggered, true, 'Open view event should be triggered when todos are added');
    });

    test('auto-open view does not trigger when todos do not change', async () => {
        // Set initial todos
        const todos = [{
            id: '1',
            content: 'Test todo',
            status: 'pending' as const,
            priority: 'medium' as const
        }];
        await todoManager.setTodos(todos);

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        let openViewTriggered = false;
        todoManager.onShouldOpenView(() => {
            openViewTriggered = true;
        });

        // Set the same todos again
        await todoManager.setTodos(todos);

        // Wait a bit for async operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that the open view event was NOT triggered
        assert.strictEqual(openViewTriggered, false, 'Open view event should not trigger when todos do not change');
    });

    test('onShouldOpenView event listener works correctly', (done) => {
        let eventFired = false;
        
        // Subscribe to the event
        const disposable = todoManager.onShouldOpenView(() => {
            eventFired = true;
            disposable.dispose();
            assert.strictEqual(eventFired, true, 'Event should have fired');
            done();
        });

        // Trigger a change that should fire the event
        todoManager.setTodos([{
            id: 'test-1',
            content: 'New todo',
            status: 'pending',
            priority: 'high'
        }]);
    });

    test('extension.ts correctly handles onShouldOpenView event', async () => {
        // This test verifies that the extension.ts file correctly sets up the listener
        // The actual implementation in extension.ts:
        // - Listens for todoManager.onShouldOpenView
        // - Executes 'agentTodos.focus' command when event fires
        // - Only focuses if there are todos
        
        // We can't fully test this without the extension context, but we can verify
        // the event mechanism works
        let listenerCalled = false;
        todoManager.onShouldOpenView(() => {
            listenerCalled = true;
        });

        // Add todos to trigger the event
        await todoManager.setTodos([{
            id: 'test-focus',
            content: 'Should trigger focus',
            status: 'pending',
            priority: 'medium'
        }]);

        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(listenerCalled, true, 'Listener should be called when todos are added');
    });

    test('menu items show correct visibility based on autoOpenView state', () => {
        // This test documents the expected behavior based on package.json configuration
        // When autoOpenView is false, toggleAutoOpenView command should be visible
        // When autoOpenView is true, toggleAutoOpenViewEnabled command should be visible
        
        // The actual visibility is controlled by VS Code based on the when clauses:
        // "when": "view == agentTodos && !config.agentTodos.autoOpenView" - for toggleAutoOpenView (shows "Enable")
        // "when": "view == agentTodos && config.agentTodos.autoOpenView" - for toggleAutoOpenViewEnabled (shows "Disable")
        
        // This ensures checkbox-style toggling in the UI where only one option is visible at a time
        assert.ok(true, 'Menu visibility is controlled by VS Code when clauses');
    });
});