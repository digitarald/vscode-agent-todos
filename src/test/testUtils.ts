import * as vscode from 'vscode';

let originalWorkspace: any;
let mockWorkspaceInstance: any;

export function setupMockWorkspace(): void {
    // Only mock once across all tests
    if (!mockWorkspaceInstance) {
        originalWorkspace = vscode.workspace;
        
        // Create mock configuration with update method
        const mockConfig = {
            get: <T>(key: string, defaultValue?: T): T => {
                // Return defaults for known keys
                if (key === 'autoInject') {return false as any;}
                if (key === 'enableSubtasks') {return true as any;}
                if (key === 'autoInjectFilePath') {return '.github/instructions/todos.instructions.md' as any;}
                if (key === 'autoOpenView') {return false as any;}
                return defaultValue!;
            },
            has: (key: string): boolean => true,
            inspect: (key: string): any => ({ defaultValue: undefined, globalValue: undefined, workspaceValue: undefined }),
            update: async (key: string, value: any, target?: any): Promise<void> => {
                // Mock update - just resolve
                return Promise.resolve();
            }
        };
        
        mockWorkspaceInstance = {
            ...originalWorkspace,
            workspaceFolders: originalWorkspace.workspaceFolders || [],
            getConfiguration: (section?: string) => mockConfig,
            onDidChangeConfiguration: originalWorkspace.onDidChangeConfiguration || (() => ({ dispose: () => {} })),
            onDidChangeWorkspaceFolders: () => {
                // Return a mock disposable
                return {
                    dispose: () => { }
                };
            }
        };

        // Check if property is configurable before trying to redefine
        const descriptor = Object.getOwnPropertyDescriptor(vscode, 'workspace');
        if (descriptor && descriptor.configurable) {
            Object.defineProperty(vscode, 'workspace', {
                value: mockWorkspaceInstance,
                configurable: true
            });
        }
    }
}

export function restoreMockWorkspace(): void {
    if (originalWorkspace && mockWorkspaceInstance) {
        // Check if property is configurable before trying to redefine
        const descriptor = Object.getOwnPropertyDescriptor(vscode, 'workspace');
        if (descriptor && descriptor.configurable) {
            Object.defineProperty(vscode, 'workspace', {
                value: originalWorkspace,
                configurable: true
            });
        }
        mockWorkspaceInstance = null;
    }
}

export function getMockExtensionContext(): vscode.ExtensionContext {
    const workspaceState = new Map<string, any>();
    return {
        subscriptions: [],
        workspaceState: {
            get: (key: string) => workspaceState.get(key),
            update: async (key: string, value: any) => {
                workspaceState.set(key, value);
            }
        }
    } as any;
}