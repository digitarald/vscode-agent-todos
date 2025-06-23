import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoMCPServerProvider } from '../../mcp/mcpProvider';

suite('MCP Provider Tests', () => {
    let provider: TodoMCPServerProvider;
    let context: vscode.ExtensionContext;

    setup(() => {
        // Create a mock context
        context = {
            subscriptions: []
        } as any;
        
        provider = new TodoMCPServerProvider(context);
    });

    teardown(async () => {
        await provider?.dispose();
    });

    test('Should provide MCP server definitions', async () => {
        const definitions = await provider.provideMcpServerDefinitions();
        
        assert.strictEqual(definitions.length, 1);
        assert.ok(definitions[0] instanceof vscode.McpHttpServerDefinition);
        
        const httpDef = definitions[0] as vscode.McpHttpServerDefinition;
        assert.strictEqual(httpDef.label, 'Todos MCP Server');
        assert.ok(httpDef.uri.toString().includes('http://localhost:'));
        assert.ok(httpDef.uri.toString().includes('/mcp'));
    });

    test('Should resolve server definition with session ID', async () => {
        await provider.ensureServerStarted();
        
        const mockDefinition = new vscode.McpHttpServerDefinition(
            'Test Server',
            vscode.Uri.parse('http://localhost:3000/test')
        );
        
        const resolved = await provider.resolveMcpServerDefinition(
            mockDefinition,
            new vscode.CancellationTokenSource().token
        );
        
        assert.ok(resolved instanceof vscode.McpHttpServerDefinition);
        const resolvedHttp = resolved as vscode.McpHttpServerDefinition;
        
        // Should return the same definition
        assert.strictEqual(resolved, mockDefinition);
    });


    test('Should ensure server starts only once', async () => {
        await provider.ensureServerStarted();
        const server1 = provider.getServer();
        
        await provider.ensureServerStarted();
        const server2 = provider.getServer();
        
        // Should be the same server instance
        assert.strictEqual(server1, server2);
    });

    test('Should handle workspace root changes', async () => {
        await provider.ensureServerStarted();
        const server = provider.getServer();
        
        if (server) {
            const testRoot = '/test/new/workspace';
            server.setWorkspaceRoot(testRoot);
            
            const config = server.getConfig();
            assert.strictEqual(config.workspaceRoot, testRoot);
        }
    });

    test('Should expose server URL', async () => {
        await provider.ensureServerStarted();
        const url = provider.getServerUrl();
        
        assert.ok(url.startsWith('http://localhost:'));
        assert.ok(url.match(/http:\/\/localhost:\d+/));
    });

    test('Should handle configuration change events', () => {
        // Verify event emitter is set up
        assert.ok(provider.onDidChangeMcpServerDefinitions);
        
        let eventFired = false;
        provider.onDidChangeMcpServerDefinitions(() => {
            eventFired = true;
        });
        
        // Fire the event
        provider['_onDidChangeMcpServerDefinitions'].fire();
        
        assert.ok(eventFired);
    });

    test('Should dispose properly', async () => {
        await provider.ensureServerStarted();
        const server = provider.getServer();
        assert.ok(server);
        
        await provider.dispose();
        
        // Server should be stopped
        assert.ok(!server['isRunning']);
    });
});