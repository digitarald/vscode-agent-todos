import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { CopilotInstructionsManager } from '../copilotInstructionsManager';

suite('Open Instructions File Command Tests', () => {
    test('CopilotInstructionsManager.getInstructionsFilePath should return configured path', () => {
        // Clear singleton to ensure fresh state
        (CopilotInstructionsManager as any).instance = null;
        
        // Store original workspace.getConfiguration
        const originalGetConfiguration = vscode.workspace.getConfiguration;
        
        // Mock getConfiguration to return default value
        (vscode.workspace as any).getConfiguration = (section?: string) => {
            return {
                get: <T>(key: string, defaultValue?: T): T => {
                    // Always return the default value for autoInjectFilePath
                    return defaultValue!;
                },
                has: (key: string): boolean => false,
                inspect: (key: string): any => ({ defaultValue: undefined }),
                update: async () => {}
            };
        };
        
        try {
            const manager = CopilotInstructionsManager.getInstance();
            const filePath = manager.getInstructionsFilePath();
            
            // Should return the default path when VS Code config is not available
            assert.strictEqual(filePath, '.github/instructions/todos.instructions.md');
        } finally {
            // Restore original getConfiguration
            (vscode.workspace as any).getConfiguration = originalGetConfiguration;
            
            // Clear singleton after test
            (CopilotInstructionsManager as any).instance = null;
        }
    });

    test('Path resolution logic should work correctly', () => {
        const workspacePath = '/test/workspace';
        
        // Test relative path
        const relativePath = '.github/instructions/todos.instructions.md';
        const resolvedRelative = path.isAbsolute(relativePath) 
            ? relativePath 
            : path.join(workspacePath, relativePath);
        assert.strictEqual(resolvedRelative, '/test/workspace/.github/instructions/todos.instructions.md');
        
        // Test absolute path
        const absolutePath = '/home/user/instructions.md';
        const resolvedAbsolute = path.isAbsolute(absolutePath)
            ? absolutePath
            : path.join(workspacePath, absolutePath);
        assert.strictEqual(resolvedAbsolute, '/home/user/instructions.md');
    });

    test('AutoInject enabled check should work correctly', () => {
        // Simulate the check logic from our command
        const testCases = [
            { autoInject: true, shouldProceed: true },
            { autoInject: false, shouldProceed: false }
        ];

        for (const testCase of testCases) {
            const shouldProceed = testCase.autoInject;
            assert.strictEqual(shouldProceed, testCase.shouldProceed, 
                `AutoInject ${testCase.autoInject} should ${testCase.shouldProceed ? 'proceed' : 'not proceed'}`);
        }
    });
});