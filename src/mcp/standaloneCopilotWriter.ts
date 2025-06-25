import * as fs from 'fs';
import * as path from 'path';
import { TodoItem } from '../types';
import { TodoMarkdownFormatter } from '../utils/todoMarkdownFormatter';

/**
 * Standalone writer for copilot instructions that doesn't depend on VS Code APIs
 */
export class StandaloneCopilotWriter {
    constructor(
        private workspaceRoot: string,
        private filePath: string = '.github/copilot-instructions.md'
    ) {}

    private getInstructionsPath(): string {
        if (path.isAbsolute(this.filePath)) {
            return this.filePath;
        }
        return path.join(this.workspaceRoot, this.filePath);
    }

    private formatTodosAsMarkdown(todos: TodoItem[], title?: string): string {
        if (todos.length === 0) {
            return '- No current todos';
        }

        // Use the shared formatter
        return TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined, true);
    }

    public async updateInstructionsWithTodos(todos: TodoItem[], title?: string): Promise<void> {
        try {
            const instructionsPath = this.getInstructionsPath();
            const dir = path.dirname(instructionsPath);

            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const todoMarkdown = this.formatTodosAsMarkdown(todos, title);
            const planSection = title ? 
                `<todos title="${title}" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">\n${todoMarkdown}\n</todos>\n\n` : 
                `<todos rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">\n${todoMarkdown}\n</todos>\n\n`;

            let existingContent = '';
            if (fs.existsSync(instructionsPath)) {
                existingContent = fs.readFileSync(instructionsPath, 'utf8');
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
            fs.writeFileSync(instructionsPath, newContent, 'utf8');
            console.log(`[StandaloneCopilotWriter] Updated copilot instructions with ${todos.length} todos`);
        } catch (error) {
            console.error('[StandaloneCopilotWriter] Error updating copilot instructions:', error);
            throw error;
        }
    }

    public async removeInstructionsTodos(): Promise<void> {
        try {
            const instructionsPath = this.getInstructionsPath();
            if (!fs.existsSync(instructionsPath)) {
                return;
            }

            const existingContent = fs.readFileSync(instructionsPath, 'utf8');
            
            // Remove the todo section
            const todoRegex = /<todos[^>]*>[\s\S]*?<\/todos>\s*\n?/;
            const newContent = existingContent.replace(todoRegex, '');

            // Only write if content changed
            if (newContent !== existingContent) {
                fs.writeFileSync(instructionsPath, newContent, 'utf8');
                console.log('[StandaloneCopilotWriter] Removed todo section from copilot instructions');
            }
        } catch (error) {
            console.error('[StandaloneCopilotWriter] Error removing todos from instructions:', error);
        }
    }
}