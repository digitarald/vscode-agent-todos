---
layout: home
---

# Agent TODOs

**Your AI pair programmer's memory system.** Seamlessly integrate persistent task tracking with GitHub Copilot and VS Code's native AI features—giving your coding assistant perfect memory across sessions.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/digitarald.agent-todos?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/digitarald.agent-todos?style=for-the-badge&logo=download&logoColor=white&color=success)](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)
[![CI](https://img.shields.io/github/actions/workflow/status/digitarald/vscode-agent-todos/auto-release.yml?style=for-the-badge&logo=github&logoColor=white)](https://github.com/digitarald/vscode-agent-todos/actions)

<div class="install-cta">
  <h2>Get Started</h2>
  <p>Install Agent TODOs and start organizing your development tasks for agentic AI workflows</p>
  <a href="https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos">Install from VS Code Marketplace</a>
</div>

<div class="quick-install">
  <h3>Quick Install</h3>
  <p>Or install directly in VS Code:</p>
  <ol>
    <li>Press <code>Ctrl+P</code> (or <code>Cmd+P</code> on Mac)</li>
    <li>Type: <code>ext install digitarald.agent-todos</code></li>
    <li>Press Enter and start planning!</li>
  </ol>
</div>

## Why Agent TODOs?

<div class="workflow-example">
  <strong>The Problem:</strong> VS Code's agent mode excels at writing code but lacks persistent memory between sessions. AI can identify TODO comments but cannot maintain an actionable task list that evolves with your project.
  
  <strong>The Solution:</strong> Agent TODOs provides VS Code's AI ecosystem with a dedicated memory system for tracking tasks, context, and priorities across coding sessions.
</div>

> *"An AI assistant that remembers what we planned to do next."* — Developer using Agent TODOs

<div class="feature-grid">
  <div class="feature-item">
    <h3>🤖 Native VS Code Integration</h3>
    <p>Built-in <code>todo_read</code> and <code>todo_write</code> tools work with GitHub Copilot and VS Code's agent mode. No configuration required—install and start planning.</p>
  </div>
  
  <div class="feature-item">
    <h3>🧠 Persistent AI Memory</h3>
    <p>AI can read, update, and remember tasks between sessions. Your coding assistant maintains context about your work and upcoming tasks.</p>
  </div>
  
  <div class="feature-item">
    <h3>📋 Visual Task Management</h3>
    <p>Interactive tree view in VS Code's Explorer with one-click status updates. Monitor progress and manage tasks without leaving your editor.</p>
  </div>
  
  <div class="feature-item">
    <h3>🔗 Auto-Sync with Copilot</h3>
    <p>Automatically inject todos into <code>.github/copilot-instructions.md</code> for enhanced AI context. Keep your AI informed about current priorities and project state.</p>
  </div>
  
  <div class="feature-item">
    <h3>⚡ Direct AI Execution</h3>
    <p>Run todos directly in VS Code Chat with context-aware assistance. Click any todo to continue working with full AI support.</p>
  </div>
  
  <div class="feature-item">
    <h3>🎯 Smart Organization</h3>
    <p>Subtasks, priorities, descriptions, and three-state workflow (pending → in-progress → completed). Keep complex projects organized and trackable.</p>
  </div>
</div>

## How It Works

<div class="workflow-steps">
  <div class="step">
    <div class="step-number">1</div>
    <div class="step-content">
      <h4>Install</h4>
      <p>Extension adds todo tools to GitHub Copilot automatically</p>
    </div>
  </div>
  
  <div class="step">
    <div class="step-number">2</div>
    <div class="step-content">
      <h4>Plan</h4>
      <p>Ask Copilot to create and organize your development tasks</p>
    </div>
  </div>
  
  <div class="step">
    <div class="step-number">3</div>
    <div class="step-content">
      <h4>Track</h4>
      <p>Visual tree view shows progress; AI remembers everything</p>
    </div>
  </div>
  
  <div class="step">
    <div class="step-number">4</div>
    <div class="step-content">
      <h4>Execute</h4>
      <p>Run todos directly in VS Code Chat with full context</p>
    </div>
  </div>
</div>

<div class="workflow-example">
  <h3>🔄 Example Workflow</h3>
  
  <div class="chat-example">
    <div class="chat-message user">
      <strong>You:</strong> "Create a todo list for implementing user authentication"
    </div>
    
    <div class="chat-message assistant">
      <strong>GitHub Copilot:</strong> "I'll create a structured plan for user authentication. Let me organize this into actionable tasks..."
      
      <div class="todo-creation">
        📝 <strong>Creating todos:</strong>
        <ul>
          <li>✅ Set up authentication routes (high priority)</li>
          <li>⏳ Configure auth library integration</li>
          <li>⏳ Create login/register endpoints</li>
          <li>⏳ Add JWT middleware for protected routes</li>
          <li>⏳ Write authentication tests</li>
        </ul>
      </div>
    </div>
    
    <div class="chat-message user">
      <strong>You:</strong> "Start with the first task"
    </div>
    
    <div class="chat-message assistant">
      <strong>GitHub Copilot:</strong> "I'll help you set up the authentication routes. Let me mark this as in-progress..."
      
      <div class="status-update">
        🔄 <strong>Updated todo:</strong> "Set up authentication routes" → <span class="status in-progress">in_progress</span>
      </div>
      
      <p><em>*Creates auth.routes.ts file*</em><br>
      <em>*Implements basic route structure*</em></p>
      
      <div class="status-update">
        ✅ <strong>Completed:</strong> "Set up authentication routes"
      </div>
    </div>
  </div>
</div>

## Quick Start

<div class="quick-start-tabs">
  <div class="tab-content">
    <h3>🤖 For AI Assistants (Recommended)</h3>
    <ol>
      <li><strong>Install</strong> the extension from VS Code Marketplace</li>
      <li><strong>Chat with GitHub Copilot</strong>: Your AI now has <code>todo_read</code> and <code>todo_write</code> tools automatically</li>
      <li><strong>Start planning</strong>: Ask Copilot to create todos, track progress, or suggest next steps</li>
      <li><strong>View results</strong>: Todos appear in the Explorer tree view and sync with Copilot's memory</li>
    </ol>
    
    <div class="try-commands">
      <h4>💬 Try asking GitHub Copilot:</h4>
      <ul>
        <li><em>"Create a todo list for implementing user authentication"</em></li>
        <li><em>"What should I work on next based on my current todos?"</em></li>
        <li><em>"Mark the database setup task as completed and suggest the next step"</em></li>
        <li><em>"Break down the API integration task into smaller subtasks"</em></li>
      </ul>
    </div>
  </div>
  
  <div class="tab-content">
    <h3>👤 For Manual Use</h3>
    <ol>
      <li><strong>Open Explorer</strong>: Find "Agent TODOs" in the VS Code Explorer sidebar</li>
      <li><strong>Start Planning</strong>: Click "Start Planning" to open VS Code Chat</li>
      <li><strong>Add Tasks</strong>: Use the tree view buttons or chat commands to manage todos</li>
      <li><strong>Track Progress</strong>: Click todos to change status, priority, or add details</li>
    </ol>
  </div>
</div>

## Advanced Features

<div class="feature-grid">
  <div class="feature-item">
    <h3>⚙️ Smart Configuration</h3>
    <p>Configure through VS Code settings (<code>Ctrl+,</code> then search "Agent TODOs"):</p>
    <ul>
      <li><strong>Auto-inject</strong>: Sync todos to <code>.github/copilot-instructions.md</code></li>
      <li><strong>Auto-open view</strong>: Open todo view when changes occur</li>
      <li><strong>Custom file path</strong>: Choose where auto-injected todos are saved</li>
    </ul>
  </div>
  
  <div class="feature-item">
    <h3>🏗️ MCP Server Mode</h3>
    <p>For advanced integrations, run the standalone MCP server:</p>
    <pre><code>npm install -g agent-todos
# or
npx agent-todos</code></pre>
    <p>Provides HTTP endpoints and SSE for real-time todo synchronization across multiple clients.</p>
  </div>
  
  <div class="feature-item">
    <h3>📋 Rich Task Management</h3>
    <ul>
      <li><strong>Subtasks</strong>: Break down complex todos into manageable pieces</li>
      <li><strong>Priorities</strong>: High, Medium, Low with visual indicators</li>
      <li><strong>Status Tracking</strong>: Pending → In Progress → Completed workflow</li>
      <li><strong>Rich Details</strong>: Add architecture decisions (ADR) and implementation notes</li>
    </ul>
  </div>
  
  <div class="feature-item">
    <h3>🔄 Auto-Sync with Copilot</h3>
    <p>Enable auto-inject to automatically maintain a <code>.github/copilot-instructions.md</code> file with your current todos.</p>
    <p>This gives GitHub Copilot perfect context about your project's current state and priorities across all conversations.</p>
  </div>
</div>

## Requirements

<div class="requirements">
  <div class="requirement">
    <h4>🆔 VS Code</h4>
    <p>Version 1.102.0 or higher</p>
  </div>
  
  <div class="requirement">
    <h4>🤖 GitHub Copilot</h4>
    <p>Extension (recommended for full features)</p>
  </div>
</div>

## Support & Contributing

- **Issues**: [Report bugs or request features](https://github.com/digitarald/vscode-agent-todos/issues)
- **Source Code**: [GitHub Repository](https://github.com/digitarald/vscode-agent-todos)
- **License**: MIT

---

**[🚀 Install Agent TODOs Now](https://marketplace.visualstudio.com/items?itemName=digitarald.agent-todos)**