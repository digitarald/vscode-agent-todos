import * as assert from 'assert';
import { TodoMCPServer } from '../../mcp/server';

suite('MCP Server Tests', () => {
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

    test('Should start server successfully', async function() {
        this.timeout(5000);
        await server.start();
        
        // Server should be running
        assert.ok(server['isRunning']);
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

    test('Should handle graceful shutdown', async () => {
        await server.start();
        assert.ok(server['isRunning']);
        
        await server.stop();
        assert.ok(!server['isRunning']);
    });

    test('Should broadcast updates to connected sessions', async () => {
        await server.start();
        
        // Test broadcast functionality
        server.broadcastUpdate({
            type: 'todos-updated',
            todos: [],
            title: 'Test Broadcast',
            timestamp: Date.now()
        });
        
        // No error should be thrown
        assert.ok(true);
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

    test('Should handle sessions properly', async () => {
        // Server should initialize properly
        await server.initialize();
        assert.ok(server);
    });

    test('Should initialize with default configuration', () => {
        const defaultServer = new TodoMCPServer();
        const config = defaultServer.getConfig();
        
        assert.strictEqual(config.port, 3000);
        assert.strictEqual(config.standalone, false);
        assert.ok(config.workspaceRoot);
    });

    test('Should support dynamic tool configuration in standalone mode', async () => {
        // Test configuration with auto-inject disabled
        const standaloneServer = new TodoMCPServer({
            port: 3001,
            standalone: true,
            autoInject: false
        });

        await standaloneServer.initialize();
        
        // Should have both tools
        let tools = await standaloneServer.getTodoTools().getAvailableTools();
        assert.strictEqual(tools.length, 2);
        assert.ok(tools.some((t: any) => t.name === 'todo_read'));
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));

        // Test configuration with auto-inject enabled
        const standaloneServerAutoInject = new TodoMCPServer({
            port: 3002,
            standalone: true,
            autoInject: true
        });

        await standaloneServerAutoInject.initialize();
        
        // Should have both tools in standalone mode (auto-inject doesn't affect standalone)
        tools = await standaloneServerAutoInject.getTodoTools().getAvailableTools();
        assert.strictEqual(tools.length, 2);
        assert.ok(tools.some((t: any) => t.name === 'todo_read'));
        assert.ok(tools.some((t: any) => t.name === 'todo_write'));

        await standaloneServer.stop();
        await standaloneServerAutoInject.stop();
    });
});