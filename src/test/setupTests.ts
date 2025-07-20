// Global test setup for VS Code extensions
import * as vscode from 'vscode';

// Create a shared mock workspace configuration
const createMockWorkspace = () => {
    const configState: Record<string, any> = {
        autoInject: false,
        enableSubtasks: true,
        autoInjectFilePath: '.github/instructions/todos.instructions.md',
        autoOpenView: false
    };
    
    const mockConfig = {
        get: <T>(key: string, defaultValue?: T): T => {
            if (key in configState) {
                return configState[key] as T;
            }
            return defaultValue!;
        },
        has: (key: string): boolean => key in configState,
        inspect: (key: string): any => ({ 
            defaultValue: undefined, 
            globalValue: undefined, 
            workspaceValue: undefined 
        }),
        update: async (key: string, value: any, target?: any): Promise<void> => {
            configState[key] = value;
            return Promise.resolve();
        }
    };
    
    return {
        workspaceFolders: [],
        getConfiguration: (section?: string) => mockConfig,
        onDidChangeConfiguration: (listener: any) => ({ dispose: () => {} }),
        onDidChangeWorkspaceFolders: (listener: any) => ({ dispose: () => {} }),
        // Add reference to config state for tests
        _configState: configState
    };
};

// Store the original workspace
const originalWorkspace = vscode.workspace;

// Replace with mock before any tests run
export const mockWorkspace = createMockWorkspace();

// Helper to reset workspace to original
export const resetWorkspace = () => {
    try {
        Object.defineProperty(vscode, 'workspace', {
            value: originalWorkspace,
            configurable: true,
            writable: true
        });
    } catch (e) {
        // Ignore if property is not configurable
    }
};

// Helper to apply mock workspace
export const applyMockWorkspace = () => {
    try {
        Object.defineProperty(vscode, 'workspace', {
            value: mockWorkspace,
            configurable: true,
            writable: true
        });
    } catch (e) {
        // If we can't redefine, try direct assignment
        (vscode as any).workspace = mockWorkspace;
    }
};