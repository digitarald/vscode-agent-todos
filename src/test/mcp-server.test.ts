import * as assert from 'assert';
import { TodoMCPServer } from '../mcp/server';

suite('MCP Server', () => {
    let server: TodoMCPServer;
    let port: number;

    setup(async () => {
        // Use a random port for testing
        port = 3000 + Math.floor(Math.random() * 1000);
        server = new TodoMCPServer({
            port,
            standalone: true
        });
    });

    teardown(async () => {
        if (server) {
            await server.stop();
        }
    });

    test('Should start and stop server successfully', async function() {
        this.timeout(5000);
        
        await server.start();
        assert.ok(server['isRunning']);

        await server.stop();
        assert.ok(!server['isRunning']);
    });

    test('Should not start server twice', async () => {
        await server.start();
        
        try {
            await server.start();
            assert.fail('Should have thrown an error');
        } catch (error: any) {
            assert.strictEqual(error.message, 'Server is already running');
        }
    });

    test('Should handle workspace root configuration', () => {
        const testRoot = '/test/workspace';
        server.setWorkspaceRoot(testRoot);
        
        const config = server.getConfig();
        assert.strictEqual(config.workspaceRoot, testRoot);
    });

    test('Should correctly identify standalone mode', () => {
        assert.strictEqual(server.isStandalone(), true);
        
        const nonStandaloneServer = new TodoMCPServer({ standalone: false });
        assert.strictEqual(nonStandaloneServer.isStandalone(), false);
    });

    test('Should broadcast updates to connected sessions', async () => {
        await server.start();
        
        // Test broadcast functionality - should not throw
        server.broadcastUpdate({
            type: 'todos-updated',
            todos: [],
            title: 'Test Broadcast',
            timestamp: Date.now()
        });
        
        assert.ok(true);
    });

    test('Should store and update configuration', async () => {
        const initialConfig = server.getConfig();
        assert.strictEqual(initialConfig.autoInject, false);

        // Broadcast configuration change
        await server.broadcastUpdate({
            type: 'configuration-changed',
            config: {
                autoInject: true,
            }
        });

        const updatedConfig = server.getConfig();
        assert.strictEqual(updatedConfig.autoInject, true);
    });
});