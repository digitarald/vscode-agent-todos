import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem } from './types';

export class CopilotInstructionsManager {
    private static instance: CopilotInstructionsManager;
    private writeInProgress = false;
    private pendingWrite: { todos: TodoItem[], title?: string } | null = null;

    private constructor() { }

    public static getInstance(): CopilotInstructionsManager {
        if (!CopilotInstructionsManager.instance) {
            CopilotInstructionsManager.instance = new CopilotInstructionsManager();
        }
        return CopilotInstructionsManager.instance;
    }

    private validateFilePath(filePath: string): boolean {
        // Check for empty or whitespace-only paths
        if (!filePath || filePath.trim().length === 0) {
            return false;
        }

        // Check for potentially dangerous paths
        const normalizedPath = path.normalize(filePath);

        // Reject paths that try to escape the workspace root with relative paths
        if (normalizedPath.includes('..') && !path.isAbsolute(normalizedPath)) {
            console.warn(`[CopilotInstructionsManager] Potentially unsafe relative path: ${filePath}`);
            return false;
        }

        // Ensure path has a valid file extension for markdown
        if (!normalizedPath.endsWith('.md')) {
            console.warn(`[CopilotInstructionsManager] File path should end with .md: ${filePath}`);
            // Return true but warn - we don't want to break functionality for non-md files
            return true;
        }

        return true;
    }

    private getConfiguredFilePath(): string {
        try {
            const config = vscode.workspace.getConfiguration('todoManager');
            const filePath = config.get<string>('autoInjectFilePath', '.github/copilot-instructions.md');

            if (!this.validateFilePath(filePath)) {
                console.warn(`[CopilotInstructionsManager] Invalid file path configured: ${filePath}, using default`);
                return '.github/copilot-instructions.md';
            }

            return filePath;
        } catch (error) {
            // Default when vscode is not available
            return '.github/copilot-instructions.md';
        }
    }

    private getInstructionsFileUri(): vscode.Uri | null {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return null;
            }

            const filePath = this.getConfiguredFilePath();

            // Check if the path is absolute
            if (path.isAbsolute(filePath)) {
                return vscode.Uri.file(filePath);
            } else {
                // Treat as relative to workspace root
                return vscode.Uri.joinPath(workspaceFolder.uri, filePath);
            }
        } catch (error) {
            return null; // vscode not available
        }
    }

    private formatTodosAsMarkdown(todos: TodoItem[], title?: string): string {
        if (todos.length === 0) {
            return '- No current todos';
        }

        // Check if subtasks are enabled
        let subtasksEnabled = true;
        try {
            subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);
        } catch (error) {
            // Default to true when vscode is not available
        }

        // Helper function to format a single todo with subtasks and details
        const formatTodo = (todo: TodoItem): string => {
            // Determine checkbox based on status
            const checkbox = todo.status === 'completed' ? '[x]' :
                todo.status === 'in_progress' ? '[-]' :
                    '[ ]';

            const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                todo.priority === 'medium' ? ' 🟡' :
                    ' 🟢';
            let result = `- ${checkbox} ${todo.id}: ${todo.content}${priorityBadge}\n`;

            // Add details if present (before subtasks)
            if (todo.details) {
                result += `  _${todo.details}_\n`;
            }

            // Add subtasks if enabled and present
            if (subtasksEnabled && todo.subtasks && todo.subtasks.length > 0) {
                todo.subtasks.forEach(subtask => {
                    const subtaskCheckbox = subtask.status === 'completed' ? '[x]' : '[ ]';
                    result += `  - ${subtaskCheckbox} ${subtask.id}: ${subtask.content}\n`;
                });
            }

            return result;
        };

        // Format todos in their original order
        let markdown = '';
        todos.forEach(todo => {
            markdown += formatTodo(todo);
        });

        return markdown.trim();
    }

    public async updateInstructionsWithTodos(todos: TodoItem[], title?: string): Promise<void> {
        // If a write is in progress, queue this update
        if (this.writeInProgress) {
            this.pendingWrite = { todos, title };
            return;
        }

        const fileUri = this.getInstructionsFileUri();
        if (!fileUri) {
            console.warn('No workspace folder found, cannot update copilot instructions');
            return;
        }

        this.writeInProgress = true;
        try {
            const todoMarkdown = this.formatTodosAsMarkdown(todos, title);
            const planSection = title ? `<todos title="${title}" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">\n${todoMarkdown}\n</todos>\n\n` : `<todos rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">\n${todoMarkdown}\n</todos>\n\n`;

            let existingContent = '';
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                existingContent = Buffer.from(fileContent).toString('utf8');
            } catch (error) {
                // File doesn't exist, will be created
                console.log('Copilot instructions file does not exist, creating it');
            }

            let newContent: string;

            if (existingContent) {
                // Remove existing todo section if it exists
                const todoRegex = /<todos[^>]*>[\s\S]*?<\/todos>\s*\n?/;
                const contentWithoutTodo = existingContent.replace(todoRegex, '');

                // Prepend the new todo section
                newContent = planSection + contentWithoutTodo;
            } else {
                // Create a minimal file with just the todo section
                newContent = `<!-- Auto-generated todo section -->\n${planSection}<!-- Add your custom Copilot instructions below -->\n`;
            }

            // Write the updated content
            const writeData = Buffer.from(newContent, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, writeData);

            console.log('Updated copilot instructions with current todos');
        } catch (error) {
            console.error('Error updating copilot instructions:', error);
            vscode.window.showErrorMessage(`Failed to update copilot instructions: ${error}`);
        } finally {
            this.writeInProgress = false;

            // Process any pending write
            if (this.pendingWrite) {
                const pending = this.pendingWrite;
                this.pendingWrite = null;
                // Process pending write after a small delay
                setTimeout(() => {
                    this.updateInstructionsWithTodos(pending.todos, pending.title);
                }, 100);
            }
        }
    }

    public async removeInstructionsTodos(): Promise<void> {
        const fileUri = this.getInstructionsFileUri();
        if (!fileUri) {
            return;
        }

        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const existingContent = Buffer.from(fileContent).toString('utf8');

            // Remove the todo section
            const todoRegex = /<todos[^>]*>[\s\S]*?<\/todos>\s*\n?/;
            const newContent = existingContent.replace(todoRegex, '');

            // Only write if content changed
            if (newContent !== existingContent) {
                const writeData = Buffer.from(newContent, 'utf8');
                await vscode.workspace.fs.writeFile(fileUri, writeData);
                console.log('Removed todo section from copilot instructions');
            }
        } catch (error) {
            // File might not exist, which is fine
            console.log('Copilot instructions file does not exist or could not be read');
        }
    }

    public async parseTodosFromInstructions(): Promise<{ todos: TodoItem[], title?: string } | null> {
        const fileUri = this.getInstructionsFileUri();
        if (!fileUri) {
            return null;
        }

        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');

            // Extract todos section
            const todoMatch = content.match(/<todos(?:\s+title="([^"]+)")?[^>]*>([\s\S]*?)<\/todos>/);
            if (!todoMatch) {
                return { todos: [], title: undefined };
            }

            // Extract title from attribute if present
            const titleFromAttr = todoMatch[1];
            const todoContent = todoMatch[2].trim();
            const lines = todoContent.split('\n');
            const todos: TodoItem[] = [];
            let title: string | undefined = titleFromAttr;
            let inComment = false;
            let currentTodo: TodoItem | null = null;

            // Check if subtasks are enabled
            const subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // Handle multi-line HTML comments
                if (trimmedLine.includes('<!--')) {
                    inComment = true;
                }
                if (inComment) {
                    if (trimmedLine.includes('-->')) {
                        inComment = false;
                    }
                    continue;
                }

                // Skip empty lines and prompt instructions
                if (trimmedLine === '' || trimmedLine.startsWith('>')) {
                    continue;
                }

                // Check for title
                if (trimmedLine.startsWith('# ')) {
                    title = trimmedLine.substring(2).trim();
                    continue;
                }

                // Check if this is a details line (indented with 2 spaces and italic)
                if (line.startsWith('  _') && line.endsWith('_') && currentTodo) {
                    const details = line.substring(3, line.length - 1).trim();
                    currentTodo.details = details;
                    continue;
                }

                // Check if this is a subtask (indented with 2 spaces)
                if (line.startsWith('  - ') && currentTodo && subtasksEnabled) {
                    const subtaskMatch = line.match(/^  - \[([ x])\] ([^:]+): (.+)$/);
                    if (subtaskMatch) {
                        const subtaskStatus = subtaskMatch[1] === 'x' ? 'completed' : 'pending';
                        const subtaskId = subtaskMatch[2].trim();
                        const subtaskContent = subtaskMatch[3].trim();

                        if (!currentTodo.subtasks) {
                            currentTodo.subtasks = [];
                        }

                        currentTodo.subtasks.push({
                            id: subtaskId,
                            content: subtaskContent,
                            status: subtaskStatus
                        });
                    }
                    continue;
                }

                // Save the previous todo if exists
                if (currentTodo) {
                    todos.push(currentTodo);
                    currentTodo = null;
                }

                // Parse todo items with ID
                let match: RegExpMatchArray | null;
                let status: 'pending' | 'in_progress' | 'completed';
                let content: string;
                let priority: 'low' | 'medium' | 'high' = 'medium';
                let id: string;

                // Check for pending todos: - [ ] id: content
                if ((match = trimmedLine.match(/^- \[ \] ([^:]+): (.+)$/))) {
                    status = 'pending';
                    id = match[1].trim();
                    content = match[2].trim();
                }
                // Check for in-progress todos: - [-] id: content
                else if ((match = trimmedLine.match(/^- \[-\] ([^:]+): (.+)$/))) {
                    status = 'in_progress';
                    id = match[1].trim();
                    content = match[2].trim();
                }
                // Check for completed todos: - [x] id: content
                else if ((match = trimmedLine.match(/^- \[x\] ([^:]+): (.+)$/i))) {
                    status = 'completed';
                    id = match[1].trim();
                    content = match[2].trim();
                }
                else {
                    continue; // Skip non-todo lines
                }

                // Extract priority from emoji at the end of content
                if (content.endsWith(' 🔴')) {
                    priority = 'high';
                    content = content.slice(0, -3).trim();
                } else if (content.endsWith(' 🟡')) {
                    priority = 'medium';
                    content = content.slice(0, -3).trim();
                } else if (content.endsWith(' 🟢')) {
                    priority = 'low';
                    content = content.slice(0, -3).trim();
                }

                currentTodo = {
                    id,
                    content,
                    status,
                    priority
                };
            }

            // Don't forget the last todo
            if (currentTodo) {
                todos.push(currentTodo);
            }

            return { todos, title };
        } catch (error) {
            console.error('Error parsing todos from instructions:', error);
            return null;
        }
    }

    public getInstructionsFilePath(): string {
        return this.getConfiguredFilePath();
    }
}
