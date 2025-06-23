# MCP Server Implementation

This directory contains the Model Context Protocol (MCP) server implementation for the Todos extension.

## Architecture

### Core Components

- **server.ts** - Main MCP server using Express and StreamableHTTPServerTransport
- **mcpProvider.ts** - VS Code MCP provider integration
- **client.ts** - Client for bidirectional communication
- **tools/todoTools.ts** - MCP tool implementations (todo_read, todo_write)
- **types.ts** - TypeScript type definitions
- **standalone.ts** - Entry point for running server without VS Code
- **standaloneTodoManager.ts** - File-based todo storage for standalone mode
- **todoSync.ts** - Synchronization between VS Code and standalone managers

### Features

1. **HTTP MCP Server**
   - Express-based HTTP server following MCP SDK patterns
   - StreamableHTTPServerTransport for protocol compliance
   - Session management for multiple connections
   - Support for POST (messages), GET (SSE), and DELETE (cleanup)

2. **Dynamic Tool Registration**
   - Tools adapt based on configuration in real-time
   - `todo_read` tool is hidden when auto-inject is enabled
   - `todo_write` schema changes based on subtasks setting

3. **Bidirectional Communication**
   - Real-time todo updates via SSE
   - Configuration change notifications
   - Status change events

4. **Standalone Mode**
   - Can run without VS Code
   - All features enabled in standalone mode
   - Environment variable configuration

## Running the Server

### Within VS Code Extension
The server starts automatically when the extension activates.

### Standalone Mode
```bash
# Default port 3000
npm run mcp-server

# Custom port
MCP_PORT=3001 npm run mcp-server

# Custom workspace
WORKSPACE_ROOT=/path/to/project npm run mcp-server
```

## Endpoints

- `GET /health` - Health check and server status
- `POST /mcp` - Main MCP endpoint for client-to-server messages
- `GET /mcp` - Server-to-client notifications via SSE
- `DELETE /mcp` - Session termination

## Testing

Comprehensive test coverage includes:
- Server lifecycle tests
- Tool operation tests
- Client communication tests
- VS Code integration tests
- End-to-end integration tests

Run tests with:
```bash
npm test
```

## Configuration

The server respects VS Code settings and updates dynamically:
- `todoManager.autoInject` - Controls todo_read tool visibility
- `todoManager.enableSubtasks` - Enables/disables subtask features  
- `todoManager.autoOpenView` - Controls view auto-opening

## Protocol Details

The implementation follows the MCP SDK HTTP server pattern:
- Uses `@modelcontextprotocol/sdk` version 1.13.0
- StreamableHTTPServerTransport for HTTP protocol handling
- Session management via `mcp-session-id` headers
- Dynamic ESM imports for SDK modules
- Graceful error handling and recovery

## Session Management

Sessions are managed automatically by the SDK:
1. Client sends POST to `/mcp` with initialize request
2. Server creates new session with unique ID
3. Session ID returned in response headers
4. Subsequent requests include session ID in headers
5. Sessions cleaned up on transport close or DELETE request