import { TodoItem, TodoStatus, TodoPriority } from '../types';

export class TodoMarkdownFormatter {
    private static readonly CHECKBOX_REGEX = /^(\s*)- \[([ x-])\] ([^:]+): (.+)$/;
    private static readonly ADR_REGEX = /^(\s*)_(.+)_$/;
    private static readonly TITLE_REGEX = /^# (.+)$/;
    
    private static readonly PRIORITY_EMOJI: Record<TodoPriority, string> = {
        high: '🔴',
        medium: '🟡', 
        low: '🟢'
    };
    
    private static readonly EMOJI_PRIORITY: Record<string, TodoPriority> = {
        '🔴': 'high',
        '🟡': 'medium',
        '🟢': 'low'
    };

    /**
     * Format todos as markdown string
     */
    public static formatTodosAsMarkdown(todos: TodoItem[], title?: string): string {
        let markdown = '';
        
        // Add title if provided
        if (title) {
            markdown += `# ${title}\n\n`;
        }
        
        // Format each todo
        todos.forEach(todo => {
            markdown += this.formatTodo(todo);
        });
        
        return markdown.trim();
    }
    
    /**
     * Format a single todo item
     */
    private static formatTodo(todo: TodoItem): string {
        // Determine checkbox based on status
        const checkbox = todo.status === 'completed' ? '[x]' :
            todo.status === 'in_progress' ? '[-]' :
            '[ ]';
        
        const priorityEmoji = this.PRIORITY_EMOJI[todo.priority];
        let result = `- ${checkbox} ${todo.id}: ${todo.content} ${priorityEmoji}\n`;
        
        // Add ADR if present
        if (todo.adr) {
            result += `  _${todo.adr}_\n`;
        }
        
        return result;
    }
    
    /**
     * Parse markdown content into TodoItem array and optional title
     */
    public static parseMarkdown(content: string): { todos: TodoItem[], title?: string } {
        const lines = content.split('\n');
        const todos: TodoItem[] = [];
        let currentTodo: TodoItem | null = null;
        let title: string | undefined;
        
        for (const line of lines) {
            // Check for title
            const titleMatch = line.match(this.TITLE_REGEX);
            if (titleMatch) {
                title = titleMatch[1].trim();
                continue;
            }
            
            // Check for todo item
            const todoMatch = line.match(this.CHECKBOX_REGEX);
            if (todoMatch) {
                // Save previous todo if exists
                if (currentTodo) {
                    todos.push(currentTodo);
                }
                
                const [, , checkboxState, id, content] = todoMatch;
                
                // Extract priority from emoji at end of content
                let priority: TodoPriority = 'medium';
                let cleanContent = content.trim();
                
                // Check for priority emoji at the end
                for (const [emoji, prio] of Object.entries(this.EMOJI_PRIORITY)) {
                    if (cleanContent.endsWith(emoji)) {
                        priority = prio;
                        cleanContent = cleanContent.slice(0, -emoji.length).trim();
                        break;
                    }
                }
                
                // Determine status from checkbox
                const status: TodoStatus = checkboxState === 'x' ? 'completed' :
                    checkboxState === '-' ? 'in_progress' : 'pending';
                
                currentTodo = {
                    id: id.trim(),
                    content: cleanContent,
                    status,
                    priority
                };
                continue;
            }
            
            // Check for ADR (must come after a todo)
            if (currentTodo) {
                const adrMatch = line.match(this.ADR_REGEX);
                if (adrMatch) {
                    currentTodo.adr = adrMatch[2].trim();
                    continue;
                }
            }
        }
        
        // Don't forget the last todo
        if (currentTodo) {
            todos.push(currentTodo);
        }
        
        return { todos, title };
    }
    
    /**
     * Generate a unique ID for new items during import
     */
    public static generateId(prefix: string = 'todo'): string {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Validate and sanitize imported todos
     */
    public static validateAndSanitizeTodos(todos: TodoItem[]): TodoItem[] {
        const seenIds = new Set<string>();
        const sanitizedTodos: TodoItem[] = [];
        
        for (const todo of todos) {
            // Ensure unique IDs
            let id = todo.id;
            if (!id || seenIds.has(id)) {
                id = this.generateId('todo');
            }
            seenIds.add(id);
            
            // Validate required fields
            if (!todo.content || todo.content.trim().length === 0) {
                continue; // Skip empty todos
            }
            
            // Ensure valid status
            const validStatuses: TodoStatus[] = ['pending', 'in_progress', 'completed'];
            const status = validStatuses.includes(todo.status) ? todo.status : 'pending';
            
            // Ensure valid priority
            const validPriorities: TodoPriority[] = ['high', 'medium', 'low'];
            const priority = validPriorities.includes(todo.priority) ? todo.priority : 'medium';
            
            sanitizedTodos.push({
                id,
                content: todo.content.trim(),
                status,
                priority,
                ...(todo.adr && { adr: todo.adr.trim() })
            });
        }
        
        return sanitizedTodos;
    }
}