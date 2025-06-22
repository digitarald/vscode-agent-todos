import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem } from './types';

export class CopilotInstructionsManager {
    private static instance: CopilotInstructionsManager;
    private readonly instructionsFileName = '.github/copilot-instructions.md';

    private constructor() { }

    public static getInstance(): CopilotInstructionsManager {
        if (!CopilotInstructionsManager.instance) {
            CopilotInstructionsManager.instance = new CopilotInstructionsManager();
        }
        return CopilotInstructionsManager.instance;
    }

    private getInstructionsFileUri(): vscode.Uri | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }
        return vscode.Uri.joinPath(workspaceFolder.uri, this.instructionsFileName);
    }

    private formatTodosAsMarkdown(todos: TodoItem[], title?: string): string {
        let markdown = '';
        // Add prompt instructions based on system prompt best practices
        markdown += `> IMPORTANT: You don't need to use todo_read tool, as the list is already available below. Review it frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.\n\n`;

        if (todos.length === 0) {
            markdown += '- No current todos';
            return markdown;
        }

        const todosByStatus = {
            'pending': todos.filter(t => t.status === 'pending'),
            'in_progress': todos.filter(t => t.status === 'in_progress'),
            'completed': todos.filter(t => t.status === 'completed')
        };

        // Pending items
        if (todosByStatus.pending.length > 0) {
            todosByStatus.pending.forEach(todo => {
                const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                    todo.priority === 'medium' ? ' 🟡' :
                        ' 🟢';
                markdown += `- [ ] ${todo.content}${priorityBadge}\n`;
            });
        }

        // In-progress items
        if (todosByStatus.in_progress.length > 0) {
            todosByStatus.in_progress.forEach(todo => {
                const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                    todo.priority === 'medium' ? ' 🟡' :
                        ' 🟢';
                markdown += `- [⏳] ${todo.content}${priorityBadge}\n`;
            });
        }

        // Completed items
        if (todosByStatus.completed.length > 0) {
            todosByStatus.completed.forEach(todo => {
                const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                    todo.priority === 'medium' ? ' 🟡' :
                        ' 🟢';
                markdown += `- [x] ${todo.content}${priorityBadge}\n`;
            });
        }

        return markdown.trim();
    }

    public async updateInstructionsWithTodos(todos: TodoItem[], title?: string): Promise<void> {
        const fileUri = this.getInstructionsFileUri();
        if (!fileUri) {
            console.warn('No workspace folder found, cannot update copilot instructions');
            return;
        }

        try {
            const todoMarkdown = this.formatTodosAsMarkdown(todos, title);
            const planSection = title ? `<todo title="${title}">\n${todoMarkdown}\n</todo>\n\n` : `<todo>\n${todoMarkdown}\n</todo>\n\n`;

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
                const todoRegex = /<todo[^>]*>[\s\S]*?<\/todo>\s*\n?/;
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
            const todoRegex = /<todo[^>]*>[\s\S]*?<\/todo>\s*\n?/;
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

            // Extract todo section
            const todoMatch = content.match(/<todo(?:\s+title="([^"]+)")?>([\s\S]*?)<\/todo>/);
            if (!todoMatch) {
                return { todos: [], title: undefined };
            }

            // Extract title from attribute if present
            const titleFromAttr = todoMatch[1];
            const todoContent = todoMatch[2].trim();
            const lines = todoContent.split('\n');
            const todos: TodoItem[] = [];
            let title: string | undefined = titleFromAttr;
            let idCounter = 1;
            let inComment = false;

            for (const line of lines) {
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

                // Skip empty lines
                if (trimmedLine === '') {
                    continue;
                }

                // Check for title
                if (trimmedLine.startsWith('# ')) {
                    title = trimmedLine.substring(2).trim();
                    continue;
                }

                // Parse todo items
                let match: RegExpMatchArray | null;
                let status: 'pending' | 'in_progress' | 'completed';
                let content: string;
                let priority: 'low' | 'medium' | 'high' = 'medium';

                // Check for pending todos: - [ ] content
                if ((match = trimmedLine.match(/^- \[ \] (.+)$/))) {
                    status = 'pending';
                    content = match[1];
                }
                // Check for in-progress todos: - [⏳] content
                else if ((match = trimmedLine.match(/^- \[⏳\] (.+)$/))) {
                    status = 'in_progress';
                    content = match[1];
                }
                // Check for completed todos: - [x] content
                else if ((match = trimmedLine.match(/^- \[x\] (.+)$/i))) {
                    status = 'completed';
                    content = match[1];
                }
                else {
                    continue; // Skip non-todo lines
                }

                // Extract priority from emoji at the end
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

                // Generate a stable ID based on content and position
                const id = `todo-${idCounter++}-${content.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20)}`;

                todos.push({
                    id,
                    content,
                    status,
                    priority
                });
            }

            return { todos, title };
        } catch (error) {
            console.error('Error parsing todos from instructions:', error);
            return null;
        }
    }

    public getInstructionsFilePath(): string {
        return this.instructionsFileName;
    }
}
