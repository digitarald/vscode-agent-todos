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
        private filePath: string = '.github/instructions/todos.instructions.md'
    ) {}

    private hasFrontmatter(content: string): boolean {
        // Check if content starts with YAML frontmatter
        return /^---\n.*?\n---\n/s.test(content);
    }

    private addFrontmatter(content: string): string {
        // Add frontmatter only if missing
        if (this.hasFrontmatter(content)) {
            return content; // Preserve existing frontmatter
        }

        const frontmatter = `---
applyTo: '**'
---

`;
        return frontmatter + content;
    }

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
        return TodoMarkdownFormatter.formatTodosAsMarkdown(todos, undefined);
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
                // Check if original content has frontmatter before modifying
                const hasExistingFrontmatter = this.hasFrontmatter(existingContent);

                // Remove existing todo section if it exists
                const todoRegex = /<todos[^>]*>[\s\S]*?<\/todos>\s*\n?/;
                const contentWithoutTodo = existingContent.replace(todoRegex, '');
                
                if (hasExistingFrontmatter) {
                    // Preserve existing frontmatter, just prepend todos after it
                    const frontmatterMatch = contentWithoutTodo.match(/^(---\n.*?\n---\n\n?)/s);
                    if (frontmatterMatch) {
                        const frontmatter = frontmatterMatch[1];
                        const contentAfterFrontmatter = contentWithoutTodo.substring(frontmatterMatch[0].length);
                        newContent = frontmatter + planSection + contentAfterFrontmatter;
                    } else {
                        // Fallback if regex fails
                        newContent = planSection + contentWithoutTodo;
                    }
                } else {
                    // No existing frontmatter, add it to the whole content
                    const contentWithTodo = planSection + contentWithoutTodo;
                    newContent = this.addFrontmatter(contentWithTodo);
                }
            } else {
                // Create a minimal file with just the todo section
                const minimalContent = `<!-- Auto-generated todo section -->\n${planSection}<!-- Add your custom Copilot instructions below -->\n`;

                // Add frontmatter
                newContent = this.addFrontmatter(minimalContent);
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