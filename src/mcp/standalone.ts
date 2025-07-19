#!/usr/bin/env node

import { TodoMCPServer } from './server';
import * as path from 'path';

async function startStandaloneServer() {
  const port = parseInt(process.env.MCP_PORT || '3000', 10);
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const autoInject = process.env.MCP_AUTO_INJECT === 'true' || process.argv.includes('--auto-inject');
  const autoInjectFilePath = process.env.MCP_AUTO_INJECT_FILE_PATH || '.github/instructions/todos.instructions.md';
  
  console.log('Starting MCP Todo Server in standalone mode...');
  console.log(`Workspace root: ${workspaceRoot}`);
  console.log(`Port: ${port}`);
  console.log(`Auto-inject: ${autoInject}`);
  
  if (autoInject) {
    console.log(`Todo export file: ${autoInjectFilePath}`);
  }
  console.log(`Todo storage: In-memory`);
  
  // Create and start the server
  const server = new TodoMCPServer({
    port,
    workspaceRoot,
    standalone: true,
    autoInject,
    autoInjectFilePath
  });
  
  try {
    await server.start();
    console.log(`\nServer is ready!`);
    console.log(`- Health check: http://localhost:${port}/health`);
    console.log(`- MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`\nTo connect a client, use the MCP endpoint.`);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down server...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\nShutting down server...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (require.main === module) {
  startStandaloneServer().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { startStandaloneServer };