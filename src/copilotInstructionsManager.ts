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

        // Check if subtasks are enabled
        const subtasksEnabled = vscode.workspace.getConfiguration('todoManager').get<boolean>('enableSubtasks', true);

        // Helper function to format a single todo with subtasks and details
        const formatTodo = (todo: TodoItem): string => {
            // Determine checkbox based on status
            const checkbox = todo.status === 'completed' ? '[x]' :
                            todo.status === 'in_progress' ? '[-]' :
                            '[ ]';
            
            const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                todo.priority === 'medium' ? ' 🟡' :
                    ' 🟢';
            let result = `- ${checkbox} ${todo.content}${priorityBadge}\n`;
            
            // Add subtasks if enabled and present
            if (subtasksEnabled && todo.subtasks && todo.subtasks.length > 0) {
                todo.subtasks.forEach(subtask => {
                    const subtaskCheckbox = subtask.status === 'completed' ? '[x]' : '[ ]';
                    result += `  - ${subtaskCheckbox} ${subtask.content}\n`;
                });
            }
            
            // Add details if present
            if (todo.details) {
                result += `  _${todo.details}_\n`;
            }
            
            return result;
        };

        // Format todos in their original order
        todos.forEach(todo => {
            markdown += formatTodo(todo);
        });

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
            let subtaskIdCounter = 1;
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

                // Check if this is a subtask (indented with 2 spaces)
                if (line.startsWith('  - ') && currentTodo && subtasksEnabled) {
                    const subtaskMatch = line.match(/^  - \[([ x])\] (.+)$/);
                    if (subtaskMatch) {
                        const subtaskStatus = subtaskMatch[1] === 'x' ? 'completed' : 'pending';
                        const subtaskContent = subtaskMatch[2];
                        
                        if (!currentTodo.subtasks) {
                            currentTodo.subtasks = [];
                        }
                        
                        currentTodo.subtasks.push({
                            id: `subtask-${subtaskIdCounter++}-${subtaskContent.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20)}`,
                            content: subtaskContent,
                            status: subtaskStatus
                        });
                    }
                    continue;
                }

                // Check if this is a details line (indented with 2 spaces and italic)
                if (line.startsWith('  _') && line.endsWith('_') && currentTodo) {
                    const details = line.substring(3, line.length - 1).trim();
                    currentTodo.details = details;
                    continue;
                }

                // Save the previous todo if exists
                if (currentTodo) {
                    todos.push(currentTodo);
                    currentTodo = null;
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
                // Check for in-progress todos: - [-] content
                else if ((match = trimmedLine.match(/^- \[-\] (.+)$/))) {
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
        return this.instructionsFileName;
    }
}
