<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Overview

This extension adds `todo_read` and `todo_write` language model tools to VS Code's agent mode with an integrated tree view for todo management. The goal is to encourage AI assistants to proactively manage todos during development workflows.

## Coding Standards

### TypeScript Patterns

- Use strict TypeScript with proper type definitions
- Implement singleton pattern for `TodoManager` (see `src/todoManager.ts`)
- Follow VS Code extension conventions with proper disposable cleanup
- Use event emitters for reactive state management

### VS Code API Usage

- Always use `vscode.lm.registerTool()` for language model tools (see https://code.visualstudio.com/api/extension-guides/tools)
- Implement `vscode.TreeDataProvider<T>` for tree views
- Use `vscode.ThemeIcon` for consistent iconography
- Follow activation event patterns: `onLanguageModelTool:tool_name`

### File Organization

```
src/
├── extension.ts          # Main activation/deactivation
├── todoManager.ts        # Singleton state management
├── todoTreeProvider.ts   # Tree view implementation
├── languageModelTools.ts # LM tool implementations
└── types.ts             # Shared interfaces
```

## Required Patterns

### Language Model Tools

```typescript
// Use this pattern for tool registration
const tool = vscode.lm.registerTool("tool_name", new ToolClass());
context.subscriptions.push(tool);

// Tool implementation must extend LanguageModelTool<T>
class TodoReadTool implements vscode.LanguageModelTool<{}> {
  async invoke(options: vscode.LanguageModelToolInvocationOptions<{}>) {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(data)),
    ]);
  }
}
```

### Tree View Pattern

```typescript
// Always implement both TreeDataProvider and TreeItem
export class TodoTreeDataProvider
  implements vscode.TreeDataProvider<TodoTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TodoTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: TodoTreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(element?: TodoTreeItem): Thenable<TodoTreeItem[]> {
    /* implementation */
  }
}
```

### Package.json Contributions

- Language model tools require: `name`, `displayName`, `modelDescription`, `tags`, `toolReferenceName`, `canBeReferencedInPrompt`
- Views must specify container (`chat` for this project), `id`, `name`, `icon`
- Commands need `command`, `title`, and `icon` fields

## Data Models

### Todo Item Structure

```typescript
interface TodoItem {
  id: string; // Unique identifier
  content: string; // Task description
  status: "todo" | "in-progress" | "completed"; // Required enum
  priority: "low" | "medium" | "high"; // Required enum
}
```

## Error Handling

- Validate all language model tool inputs before processing
- Return descriptive error messages via `LanguageModelTextPart`
- Use try/catch blocks around VS Code API calls
- Dispose of resources properly in `deactivate()`

## Security Notes

- Never store sensitive data in todo items
- Validate input schemas strictly in language model tools
- Use VS Code's built-in confirmation dialogs for destructive actions

## Testing Strategy

- Test extension activation/deactivation lifecycle
- Verify language model tool registration and invocation
- Test tree view data updates and refresh behavior
- Validate todo state persistence across sessions
