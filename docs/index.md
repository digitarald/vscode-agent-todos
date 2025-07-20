---
layout: home
---

# Agent TODOs

**Your AI pair programmer's memory system.** Seamlessly integrate persistent task tracking with GitHub Copilot and VS Code's native AI features—giving your coding assistant perfect memory across sessions.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/digitarald.agent-todos?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/digitarald.agent-todos?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)

## Install Now

🚀 **[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)**

Or install directly in VS Code:
1. Open VS Code
2. Press `Ctrl+P` (or `Cmd+P` on Mac)
3. Type: `ext install digitarald.agent-todos`
4. Press Enter

## Why Agent TODOs?

VS Code's agent mode is brilliant at writing code but lacks persistent memory between sessions. AI can spot TODO comments but can't maintain an actionable task list that evolves with your project.

**Agent TODOs bridges this gap** by giving VS Code's AI ecosystem a dedicated memory system for tracking tasks, context, and priorities across coding sessions.

> *"Finally, an AI assistant that remembers what we planned to do next."*

## Key Features

- **🤖 Native VS Code Integration**: Built-in `todo_read` and `todo_write` tools that work seamlessly with GitHub Copilot and VS Code's agent mode
- **🧠 Persistent AI Memory**: AI can read, update, and remember tasks between sessions—no more lost context
- **📋 Visual Task Management**: Interactive tree view in VS Code's Explorer with one-click status updates
- **🔗 Auto-Sync with Copilot**: Automatically inject todos into `.github/copilot-instructions.md` for enhanced AI context
- **⚡ Instant AI Execution**: Run todos directly in VS Code Chat with context-aware assistance
- **🎯 Smart Organization**: Subtasks, priorities, rich descriptions, and three-state workflow (pending → in-progress → completed)
- **🔧 Flexible Integration**: Works as VS Code extension or standalone MCP server for advanced integrations

## How It Works

1. **Install** → Extension adds todo tools to GitHub Copilot automatically
2. **Plan** → Ask Copilot to create and organize your development tasks  
3. **Track** → Visual tree view shows progress; AI remembers everything
4. **Execute** → Run todos directly in VS Code Chat with full context

### Example Workflow

```
You: "Create a todo list for implementing user authentication"

GitHub Copilot: "I'll create a structured plan for user authentication. 
Let me organize this into actionable tasks..."

📝 Creating todos:
• Set up authentication routes (high priority)
• Configure auth library integration
• Create login/register endpoints
• Add JWT middleware for protected routes
• Write authentication tests

You: "Start with the first task"

GitHub Copilot: "I'll help you set up the authentication routes. 
First, let me mark this as in-progress..."

🔄 Updated todo: "Set up authentication routes" → in_progress

*Creates auth.routes.ts file*
*Implements basic route structure*

✅ Marking "Set up authentication routes" as completed
```

## Quick Start

### For AI Assistants (Recommended)

1. **Install** the extension from VS Code Marketplace
2. **Chat with GitHub Copilot**: Your AI now has `todo_read` and `todo_write` tools automatically
3. **Start planning**: Ask Copilot to create todos, track progress, or suggest next steps
4. **Watch the magic**: Todos appear in the Explorer tree view and sync with Copilot's memory

**Try asking GitHub Copilot:**
- *"Create a todo list for implementing user authentication"*
- *"What should I work on next based on my current todos?"*  
- *"Mark the database setup task as completed and suggest the next step"*

### For Manual Use

1. **Open Explorer**: Find "Agent TODOs" in the VS Code Explorer sidebar
2. **Start Planning**: Click "Start Planning" to open VS Code Chat
3. **Add Tasks**: Use the tree view buttons or chat commands to manage todos
4. **Track Progress**: Click todos to change status, priority, or add details

## Documentation

### Configuration

Configure the extension through VS Code settings (`Ctrl+,` then search for "Agent TODOs"):

- **Auto-inject**: Automatically sync todos to `.github/copilot-instructions.md`
- **Auto-open view**: Open the todo view when changes occur
- **File path**: Customize where auto-injected todos are saved

### Advanced Usage

#### MCP Server Mode

For advanced integrations, run the standalone MCP server:

```bash
npm install -g agent-todos
# or
npx agent-todos
```

The server provides HTTP endpoints and SSE for real-time todo synchronization across multiple clients.

#### Subtasks & Priorities

- **Subtasks**: Break down complex todos into manageable pieces
- **Priorities**: High, Medium, Low with visual indicators
- **Status Tracking**: Pending → In Progress → Completed workflow
- **Rich Details**: Add architecture decisions (ADR) and implementation notes

#### Auto-Sync with Copilot

Enable auto-inject to automatically maintain a `.github/copilot-instructions.md` file with your current todos. This gives GitHub Copilot perfect context about your project's current state and priorities.

## Requirements

- **VS Code** 1.102.0 or higher
- **GitHub Copilot** extension (recommended for full features)

## Support & Contributing

- **Issues**: [Report bugs or request features](https://github.com/digitarald/vscode-agent-todos/issues)
- **Source Code**: [GitHub Repository](https://github.com/digitarald/vscode-agent-todos)
- **License**: MIT

---

**[🚀 Install Agent TODOs Now](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)**