# Telemetry Implementation

The Agent TODOs extension includes privacy-preserving telemetry using Application Insights via the `@vscode/extension-telemetry` package.

## Features

### TelemetryManager

A centralized telemetry service that handles:

- **Privacy-preserving data collection**: Automatically filters sensitive information
- **Graceful fallback**: Works seamlessly when telemetry is disabled or unavailable
- **Application Insights integration**: Uses connection string for configuration
- **Proper resource management**: Integrates with VS Code's disposal pattern

### Events Tracked

#### Extension Lifecycle
- `extension.activate` - Extension activation with version info
- `extension.deactivate` - Extension deactivation

#### Feature Usage
- `command.clearTodos` - When users clear all todos (includes todo count)
- `command.toggleAutoInject` - When auto-inject setting is toggled
- `command.runTodo` - When users run a todo in chat (includes status/priority)
- `todos.updated` - When todo list is modified (includes count changes)
- `todos.cleared` - When todos are cleared (includes cleared count)

#### MCP Operations
- `mcp.provider.registered` - MCP server provider registration
- `mcp.server.started` - MCP server startup success
- `mcp.read.success` - Successful MCP read operations (includes todo count)
- `mcp.read.blocked` - Blocked read operations (e.g., auto-inject enabled)
- `mcp.write.success` - Successful MCP write operations (includes status counts)

#### Error Tracking
- `extension.error` - Extension activation/operation errors
- `extension.exception` - Unhandled exceptions
- Errors include sanitized error messages and context information

### Privacy Protection

The implementation includes comprehensive privacy protection:

#### Sensitive Data Filtering
- **Sensitive keys**: Filters properties like `content`, `text`, `password`, `path`, `token`
- **Value length limits**: Truncates values over 100 characters
- **Error message sanitization**: Removes file paths and potential tokens from error messages

#### What's NOT Collected
- Todo content or descriptions
- File paths or workspace information
- Personal identifiers
- Sensitive configuration values

#### What IS Collected
- Feature usage patterns (anonymized)
- Error rates and types
- Performance metrics (counts, timings)
- Configuration state (enabled/disabled flags)

## Configuration

### Application Insights Connection String

The telemetry requires an Application Insights connection string to be configured:

```bash
# Set via environment variable
export APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=your-key-here;IngestionEndpoint=https://your-region.in.applicationinsights.azure.com/"
```

### For Development

In development, telemetry is disabled by default (no connection string). To test telemetry:

1. Set up an Application Insights resource in Azure
2. Configure the connection string
3. Install the extension in VS Code
4. Monitor events in the Application Insights dashboard

### For Production

The connection string should be securely provided through:
- Environment variables
- Azure Key Vault
- Secure configuration management

## Implementation Details

### Dynamic Loading

The implementation uses dynamic `require()` with `eval()` to avoid bundling issues with esbuild:

```typescript
const telemetryLibrary = '@vscode/extension-telemetry';
const TelemetryReporter = eval('require')(telemetryLibrary).TelemetryReporter;
```

This ensures:
- The telemetry library isn't bundled into the extension
- Runtime loading works in VS Code environment
- Graceful fallback when library is unavailable

### Integration Points

Telemetry is integrated at key extension points:

1. **Extension lifecycle** (activate/deactivate)
2. **Command handlers** (user actions)
3. **TodoManager operations** (data changes)
4. **MCP server operations** (tool usage)
5. **Error boundaries** (exception handling)

### Testing

The telemetry implementation includes comprehensive tests:

- Initialization without connection string
- Event sending when disabled
- Sensitive data filtering
- Resource disposal
- Error handling

Run tests with: `npm test`

## Data Retention and Compliance

- Data is stored in Application Insights with standard retention policies
- No personally identifiable information is collected
- Users can disable telemetry through VS Code settings
- Complies with VS Code extension telemetry guidelines