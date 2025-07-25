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

/**
 * Additional properties describing a Tool to clients.
 * 
 * NOTE: all properties in ToolAnnotations are **hints**.
 * They are not guaranteed to provide a faithful description of
 * tool behavior (including descriptive properties like `title`).
 * 
 * Clients should never make tool use decisions based on ToolAnnotations
 * received from untrusted servers.
 */
export interface ToolAnnotations {
  /**
   * A human-readable title for the tool.
   */
  title?: string;

  /**
   * If true, the tool does not modify its environment.
   * 
   * Default: false
   */
  readOnlyHint?: boolean;

  /**
   * If true, the tool may perform destructive updates to its environment.
   * If false, the tool performs only additive updates.
   * 
   * (This property is meaningful only when `readOnlyHint == false`)
   * 
   * Default: true
   */
  destructiveHint?: boolean;

  /**
   * If true, calling the tool repeatedly with the same arguments
   * will have no additional effect on its environment.
   * 
   * (This property is meaningful only when `readOnlyHint == false`)
   * 
   * Default: false
   */
  idempotentHint?: boolean;

  /**
   * If true, this tool may interact with an "open world" of external
   * entities. If false, the tool's domain of interaction is closed.
   * For example, the world of a web search tool is open, whereas that
   * of a memory tool is not.
   * 
   * Default: true
   */
  openWorldHint?: boolean;
}