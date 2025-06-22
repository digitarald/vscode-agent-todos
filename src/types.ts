export interface Subtask {
    id: string;
    content: string;
    status: 'pending' | 'completed';
}

export interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'low' | 'medium' | 'high';
    subtasks?: Subtask[];
    details?: string;
}

export interface TodoWriteInput {
    todos: TodoItem[];
    title?: string;
}
