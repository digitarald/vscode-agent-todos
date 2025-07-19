export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
    adr?: string;
}

export interface TodoWriteInput {
    todos: TodoItem[];
    title?: string;
}

export interface ArchivedTodoList {
    id: string;
    title: string;
    todos: TodoItem[];
    archivedAt: Date;
    slug: string;
}
