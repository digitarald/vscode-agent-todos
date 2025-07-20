import * as assert from 'assert';
import * as vscode from 'vscode';
import { getMockExtensionContext } from './testUtils';

suite('MCP Integration Tests', () => {
    let context: vscode.ExtensionContext;

    setup(() => {
        context = getMockExtensionContext();
    });

    teardown(() => {
        // Cleanup
    });

    test('Extension context is initialized', () => {
        assert.ok(context, 'Extension context should be available');
        assert.ok(context.subscriptions, 'Context should have subscriptions');
        assert.ok(context.workspaceState, 'Context should have workspaceState');
        assert.ok(Array.isArray(context.subscriptions), 'Subscriptions should be an array');
    });
});