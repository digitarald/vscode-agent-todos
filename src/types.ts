export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high';
export type SubtaskStatus = 'pending' | 'completed';

export interface Subtask {
    id: string;
    content: string;
    status: SubtaskStatus;
}

export interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
    subtasks?: Subtask[];
    details?: string;
}

export interface TodoWriteInput {
    todos: TodoItem[];
    title?: string;
}
