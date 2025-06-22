export interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'low' | 'medium' | 'high';
}

export interface TodoWriteInput {
    todos: TodoItem[];
    title?: string;
}
