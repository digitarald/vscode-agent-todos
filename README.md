# Todos

A VS Code extension that adds todo management tools for AI assistants and provides an interactive tree view.

## Features

- **AI Integration**: `todo_read` and `todo_write` tools for AI assistants to manage todos
- **Interactive Tree View**: Todo list displayed in the Panel with click-to-toggle status
- **Status & Priority**: Support for pending/in-progress/completed status and low/medium/high priority
- **Auto-inject Mode**: Synchronize todos with `.github/copilot-instructions.md` for seamless integration
- **File Monitoring**: When auto-inject is enabled, changes to the instructions file are automatically synced

## Usage

### AI Assistant Tools

AI assistants can use two tools:

- **`todo_read`**: Returns current todos as JSON
- **`todo_write`**: Updates the todo list with new items

Each todo has: `id`, `content`, `status` ("pending"|"in_progress"|"completed"), `priority` ("low"|"medium"|"high")

### Interactive Tree View

The tree view shows all todos with visual indicators. Click any item to cycle through statuses.

### Auto-inject Mode

When enabled via the settings gear icon, todos are automatically synchronized with `.github/copilot-instructions.md`:

- Todos are written to a `<plan>` section in the markdown file
- Changes made directly to the markdown file are synced back to the extension
- Format: `- [ ]` for pending, `- [⏳]` for in-progress, `- [x]` for completed
- Priority indicators: 🔴 (high), 🟡 (medium), 🟢 (low)

## Development

```bash
npm install
npm run compile
```

Press `F5` to run in development mode.

## Requirements

VS Code 1.101.0 or higher
