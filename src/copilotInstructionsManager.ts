import * as vscode from 'vscode';
import * as path from 'path';
import { TodoItem } from './types';
import { TodoMarkdownFormatter } from './utils/todoMarkdownFormatter';

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
            const config = vscode.workspace.getConfiguration('agentTodos');
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
            subtasksEnabled = vscode.workspace.getConfiguration('agentTodos').get<boolean>('enableSubtasks', true);
        } catch (error) {
            // Default to true when vscode is not available
        }

        // Use the shared formatter, but without title since we handle that differently
        return TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, subtasksEnabled);
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


    public getInstructionsFilePath(): string {
        return this.getConfiguredFilePath();
    }
}
