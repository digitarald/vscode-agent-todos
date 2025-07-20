# Agent TODOs

[![CI](https://github.com/digitarald/vscode-agent-todos/actions/workflows/auto-release.yml/badge.svg)](https://github.com/digitarald/vscode-agent-todos/actions/workflows/auto-release.yml)
[![Release](https://github.com/digitarald/vscode-agent-todos/actions/workflows/release.yml/badge.svg)](https://github.com/digitarald/vscode-agent-todos/actions/workflows/release.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/digitarald.agent-todos)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/digitarald.agent-todos)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)

**Your AI pair programmer's memory system.** Seamlessly integrate persistent task tracking with GitHub Copilot and VS Code's native AI features—giving your coding assistant perfect memory across sessions.

> *"Finally, an AI assistant that remembers what we planned to do next."*

## Why Agent TODOs?

VS Code's agent mode is incredibly powerful for code generation and problem-solving. Agent TODOs takes this foundation to the next level by adding advanced workflow management capabilities that transform how agent mode handles complex, multi-session projects.

**Agent TODOs upgrades your AI coding experience** by adding a persistent memory system that:

- **Enhances workflow continuity** across sessions, building on VS Code's excellent chat capabilities
- **Scales task complexity** by adding structured decomposition to complement VS Code's problem-solving power  
- **Optimizes context efficiency** by working alongside VS Code's native AI to manage information flow
- **Adds professional tracking** with rollback capabilities that extend VS Code's debugging features

## Key Features

- **🗺️ Persistent AI Memory**: Structured task decomposition that survives session restarts—no more lost context or repeated work
- **📊 Workflow State Management**: Three-state tracking (pending → in-progress → completed) with priority levels and rich task descriptions
- **🤖 Native VS Code Integration**: Built-in `todo_read` and `todo_write` tools that work seamlessly with GitHub Copilot and VS Code's agent mode
- **🧠 Context Window Optimization**: Isolates active tasks to prevent token overflow while maintaining full project context
- **🔗 Auto-Sync with Copilot**: Automatically inject todos into `.github/copilot-instructions.md` for enhanced AI context awareness
- **🎯 Smart Task Management**: Interactive tree view in VS Code's Explorer with one-click status updates and instant AI execution
- **🛡️ Error Recovery**: Granular tracking enables rollback, retry, and debugging of failed development steps
- **🔧 Flexible Integration**: Works as VS Code extension or standalone MCP server for advanced integrations

## How It Works

1. **Install** → Extension adds todo tools to GitHub Copilot automatically
2. **Plan** → Ask Copilot to create and organize your development tasks  
3. **Track** → Visual tree view shows progress; AI remembers everything
4. **Execute** → Run todos directly in VS Code Chat with full context

### 🔄 Example Workflow

```
You: "Create a todo list for implementing user authentication"

GitHub Copilot: "I'll create a structured plan for user authentication. Let me break this down into atomic, trackable tasks..."

📝 Creating todos:
• Set up authentication routes (high priority)
• Configure auth library integration  
• Create login/register endpoints
• Add JWT middleware for protected routes
• Write authentication tests

You: "Start with the first task"

GitHub Copilot: "I'll help you set up the authentication routes. First, let me mark this as in-progress to track our workflow state..."

🔄 Updated todo: "Set up authentication routes" → in_progress

*Creates auth.routes.ts file*
*Implements basic route structure*

✅ Marking "Set up authentication routes" as completed

Now moving to the next task in our workflow...

🔄 Updated todo: "Configure auth library integration" → in_progress

*Installs passport and express-jwt packages*
*Sets up auth configuration*

✅ Completed "Configure auth library integration"

You: "What's left to do?"

GitHub Copilot: "Let me check your current workflow state..."

📋 Authentication TODOs (2/5 completed):
✅ Set up authentication routes
✅ Configure auth library integration  
⏳ Create login/register endpoints (next up)
⏳ Add JWT middleware for protected routes
⏳ Write authentication tests

You: "Use the existing auth library we have"

GitHub Copilot: "I see you already have `express-jwt` and `passport` in your dependencies. Let me update our approach to leverage these existing libraries and avoid redundant work..."

🔄 Updated todo: "Create login/register endpoints" → in_progress

*Configures passport strategies*
*Integrates with existing user model*  
*Creates streamlined auth endpoints using passport*

✅ Completed "Create login/register endpoints"

The existing auth library simplified our implementation significantly. Our persistent workflow state helped me avoid reprocessing the project setup...

🔄 Updated todo: "Add JWT middleware for protected routes" → in_progress
```

## Quick Start

### For Agent Mode (Recommended)

1. **Install** the extension from VS Code Marketplace
2. **Chat with GitHub Copilot**: Your AI now has `todo_read` and `todo_write` tools automatically
3. **Start planning**: Ask Copilot to create todos, track progress, or suggest next steps
4. **Watch the magic**: Todos appear in the Explorer tree view and sync with Copilot's memory

**Try asking GitHub Copilot:**
- *"Create a todo list for implementing user authentication"*
- *"What should I work on next based on my current todos?"*  
- *"Mark the database setup task as completed and suggest the next step"*

## Get Started

### Quick Setup

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)
2. **Open VS Code Chat** and start planning with GitHub Copilot
3. **Enable Auto-sync** (optional): `Settings > Extensions > Agent TODOs > Auto-inject`

### Try These Commands

Ask GitHub Copilot:
- *"Create a todo list for implementing user authentication"*
- *"What should I work on next based on my current todos?"*  
- *"Mark the database setup task as completed and suggest the next step"*

---

## Requirements

- **VS Code** 1.101.0 or higher
- **GitHub Copilot** extension

## Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/digitarald/vscode-agent-todos/issues) or submit a pull request.

## Privacy Policy

Agent TODOs includes optional telemetry to help improve the extension:

- **No personal data is collected** - only anonymized usage patterns and error rates
- **Todo content is never transmitted** - your tasks remain private
- **Disabled by default** - requires explicit configuration to enable
- **Follows VS Code telemetry standards** - uses `@vscode/extension-telemetry`

Users can disable telemetry through VS Code's telemetry settings. See `telemetry.json` for details on data collected.

## License

MIT License - see [LICENSE](LICENSE) for details.
