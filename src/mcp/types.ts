import { TodoItem } from '../types';

export interface TodoEvent {
  type: 'todos-updated' | 'todo-status-changed' | 'configuration-changed';
  todos?: TodoItem[];
  title?: string;
  todoId?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  config?: {
    autoInject?: boolean;
    autoInjectFilePath?: string;
  };
  timestamp: number;
}

export interface SessionData {
  id: string;
  workspaceRoot?: string;
  sseConnection?: any;
  createdAt: number;
  lastActivity: number;
}

export interface MCPServerConfig {
  port?: number;
  workspaceRoot?: string;
  standalone?: boolean;
  autoInject?: boolean;
  autoInjectFilePath?: string;
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}