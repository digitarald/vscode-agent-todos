import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ITodoStorage } from './ITodoStorage';
import { TodoItem, Subtask } from '../types';

export class CopilotInstructionsStorage extends EventEmitter implements ITodoStorage {
    private fileWatcher: fs.FSWatcher | undefined;
    private isUpdatingFile: boolean = false;
    private updateDebounceTimer: NodeJS.Timeout | undefined;

    constructor(private workspaceRoot: string, private filePath?: string) {
        super();
        this.startWatchingFile();
    }

    private getConfiguredFilePath(): string {
        return this.filePath || '.github/copilot-instructions.md';
    }

    private getInstructionsPath(): string {
        const configuredPath = this.getConfiguredFilePath();

        // Check if the path is absolute
        if (path.isAbsolute(configuredPath)) {
            return configuredPath;
        } else {
            // Treat as relative to workspace root
            return path.join(this.workspaceRoot, configuredPath);
        }
    }

    async load(): Promise<{ todos: TodoItem[], title: string }> {
        try {
            const filePath = this.getInstructionsPath();
            if (!fs.existsSync(filePath)) {
                return { todos: [], title: 'Todos' };
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const result = this.parseTodosFromContent(content);
            console.log(`[CopilotInstructionsStorage] Loaded ${result.todos.length} todos from file`);
            return result;
        } catch (error) {
            console.error('Error loading todos from copilot instructions:', error);
            return { todos: [], title: 'Todos' };
        }
    }

    async save(todos: TodoItem[], title: string): Promise<void> {
        this.isUpdatingFile = true;
        try {
            const filePath = this.getInstructionsPath();
            const dir = path.dirname(filePath);

            // Ensure directory exists
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let existingContent = '';
            if (fs.existsSync(filePath)) {
                existingContent = fs.readFileSync(filePath, 'utf8');
            }

            const todoMarkdown = this.formatTodosAsMarkdown(todos, title);
            const planSection = `<todos${title && title !== 'Todos' ? ` title="${title}"` : ''} rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">\n${todoMarkdown}\n</todos>\n\n`;

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

            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`[CopilotInstructionsStorage] Saved ${todos.length} todos to file`);
            this.emit('change');
        } catch (error) {
            console.error('Error saving todos to copilot instructions:', error);
            throw error;
        } finally {
            // Reset flag after a short delay to handle async file system events
            setTimeout(() => {
                this.isUpdatingFile = false;
            }, 500);
        }
    }

    async clear(): Promise<void> {
        await this.save([], 'Todos');
    }

    onDidChange(callback: () => void): { dispose: () => void } {
        this.on('change', callback);
        return {
            dispose: () => this.off('change', callback)
        };
    }

    private startWatchingFile(): void {
        const filePath = this.getInstructionsPath();
        const dir = path.dirname(filePath);

        // Watch the directory if file doesn't exist yet
        const watchPath = fs.existsSync(filePath) ? filePath : dir;

        if (fs.existsSync(watchPath)) {
            this.fileWatcher = fs.watch(watchPath, (eventType) => {
                if (!this.isUpdatingFile) {
                    this.handleFileChange();
                }
            });
        }
    }

    private handleFileChange(): void {
        // Debounce rapid changes
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }

        this.updateDebounceTimer = setTimeout(() => {
            console.log('[CopilotInstructionsStorage] File changed externally, emitting change event');
            this.emit('change');
        }, 300);
    }

    private formatTodosAsMarkdown(todos: TodoItem[], title?: string): string {
        if (todos.length === 0) {
            return '- No current todos';
        }

        // Helper function to format a single todo with subtasks and adr
        const formatTodo = (todo: TodoItem): string => {
            // Determine checkbox based on status
            const checkbox = todo.status === 'completed' ? '[x]' :
                todo.status === 'in_progress' ? '[-]' :
                    '[ ]';

            const priorityBadge = todo.priority === 'high' ? ' 🔴' :
                todo.priority === 'medium' ? ' 🟡' :
                    ' 🟢';
            let result = `- ${checkbox} ${todo.content}${priorityBadge}\n`;

            // Add subtasks if present
            if (todo.subtasks && todo.subtasks.length > 0) {
                todo.subtasks.forEach(subtask => {
                    const subtaskCheckbox = subtask.status === 'completed' ? '[x]' : '[ ]';
                    result += `  - ${subtaskCheckbox} ${subtask.content}\n`;
                });
            }

            // Add adr if present
            if (todo.adr) {
                result += `  _${todo.adr}_\n`;
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

    private parseTodosFromContent(content: string): { todos: TodoItem[], title: string } {
        // Extract todos section
        const todoMatch = content.match(/<todos(?:\s+title="([^"]+)")?[^>]*>([\s\S]*?)<\/todos>/);
        if (!todoMatch) {
            return { todos: [], title: 'Todos' };
        }

        // Extract title from attribute if present
        const titleFromAttr = todoMatch[1];
        const todoContent = todoMatch[2].trim();
        const lines = todoContent.split('\n');
        const todos: TodoItem[] = [];
        let title: string = titleFromAttr || 'Todos';
        let idCounter = 1;
        let subtaskIdCounter = 1;
        let inComment = false;
        let currentTodo: TodoItem | null = null;

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
            if (line.startsWith('  - ') && currentTodo) {
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

            // Check if this is an adr line (indented with 2 spaces and italic)
            if (line.startsWith('  _') && line.endsWith('_') && currentTodo) {
                const adr = line.substring(3, line.length - 1).trim();
                currentTodo.adr = adr;
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
    }

    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.close();
        }
        if (this.updateDebounceTimer) {
            clearTimeout(this.updateDebounceTimer);
        }
        this.removeAllListeners();
    }
}