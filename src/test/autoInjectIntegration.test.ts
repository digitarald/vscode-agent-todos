import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StandaloneCopilotWriter } from '../mcp/standaloneCopilotWriter';
import { CopilotInstructionsManager } from '../copilotInstructionsManager';
import { TodoItem } from '../types';

suite('AutoInject Feature Integration Tests', () => {
    let tempDir: string;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoinject-integration-test-'));
    });

    teardown(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    suite('Default Path Configuration', () => {
        test('StandaloneCopilotWriter should use new default path', () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const pathMethod = (writer as any).getInstructionsPath.bind(writer);
            
            const path = pathMethod();
            assert.ok(path.endsWith('.github/instructions/todos.instructions.md'));
        });

        test('CopilotInstructionsManager should use new default path', () => {
            const manager = CopilotInstructionsManager.getInstance();
            const pathMethod = (manager as any).getConfiguredFilePath.bind(manager);
            
            // This will use the fallback since VS Code isn't available in tests
            const path = pathMethod();
            assert.strictEqual(path, '.github/instructions/todos.instructions.md');
        });
    });

    suite('Frontmatter Integration', () => {
        test('Should create complete file with frontmatter and todos', async () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const todos: TodoItem[] = [
                { id: 'integration-1', content: 'Test integration', status: 'pending', priority: 'high' }
            ];

            await writer.updateInstructionsWithTodos(todos, 'Integration Test');

            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            assert.ok(fs.existsSync(filePath), 'File should be created');

            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check frontmatter
            assert.ok(content.startsWith('---\napplyTo: \'**\'\n---\n\n'));
            
            // Check todos section
            assert.ok(content.includes('<todos title="Integration Test"'));
            assert.ok(content.includes('Test integration'));
            
            // Check complete structure
            const lines = content.split('\n');
            assert.strictEqual(lines[0], '---');
            assert.strictEqual(lines[1], 'applyTo: \'**\'');
            assert.strictEqual(lines[2], '---');
            assert.strictEqual(lines[3], '');
            assert.ok(lines[4].includes('Auto-generated todo section'));
        });

        test('Should preserve existing frontmatter during updates', async () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            
            // Create directory and initial file with custom frontmatter
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const initialContent = `---
title: Custom Instructions
applyTo: '*.ts'
version: 2.0
---

# Existing Instructions

Some custom content here.
`;
            fs.writeFileSync(filePath, initialContent, 'utf8');

            const todos: TodoItem[] = [
                { id: 'preserve-1', content: 'Preserve frontmatter test', status: 'in_progress', priority: 'medium' }
            ];

            await writer.updateInstructionsWithTodos(todos);

            const updatedContent = fs.readFileSync(filePath, 'utf8');
            
            // Should preserve all custom frontmatter fields
            assert.ok(updatedContent.includes('title: Custom Instructions'));
            assert.ok(updatedContent.includes('applyTo: \'*.ts\''));
            assert.ok(updatedContent.includes('version: 2.0'));
            
            // Should include new todos
            assert.ok(updatedContent.includes('<todos rule='));
            assert.ok(updatedContent.includes('Preserve frontmatter test'));
            
            // Should preserve existing content
            assert.ok(updatedContent.includes('# Existing Instructions'));
            assert.ok(updatedContent.includes('Some custom content here.'));
            
            // Should not add the default frontmatter since custom frontmatter exists
            assert.strictEqual(updatedContent.indexOf('applyTo: \'**\''), -1);
        });
    });

    suite('Directory Creation', () => {
        test('Should create nested directories for new default path', async () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const todos: TodoItem[] = [
                { id: 'nested-1', content: 'Nested directory test', status: 'completed', priority: 'low' }
            ];

            await writer.updateInstructionsWithTodos(todos);

            // Verify nested directory structure was created
            const githubDir = path.join(tempDir, '.github');
            const instructionsDir = path.join(tempDir, '.github/instructions');
            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            
            assert.ok(fs.existsSync(githubDir), '.github directory should exist');
            assert.ok(fs.existsSync(instructionsDir), '.github/instructions directory should exist');
            assert.ok(fs.existsSync(filePath), 'todos.instructions.md file should exist');

            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.includes('Nested directory test'));
        });
    });

    suite('Frontmatter Accumulation Bug Fix', () => {
        test('Should not accumulate frontmatter on multiple todo updates', async () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            
            // First update - creates file with frontmatter
            const todos1: TodoItem[] = [
                { id: 'bug-test-1', content: 'First todo', status: 'pending', priority: 'high' }
            ];
            await writer.updateInstructionsWithTodos(todos1, 'First Update');

            let content = fs.readFileSync(filePath, 'utf8');
            let frontmatterCount = (content.match(/^---\n/gm) || []).length;
            assert.strictEqual(frontmatterCount, 1, 'Should have exactly one frontmatter section after first update');

            // Second update - should not add more frontmatter
            const todos2: TodoItem[] = [
                { id: 'bug-test-1', content: 'First todo', status: 'completed', priority: 'high' },
                { id: 'bug-test-2', content: 'Second todo', status: 'pending', priority: 'medium' }
            ];
            await writer.updateInstructionsWithTodos(todos2, 'Second Update');

            content = fs.readFileSync(filePath, 'utf8');
            frontmatterCount = (content.match(/^---\n/gm) || []).length;
            assert.strictEqual(frontmatterCount, 1, 'Should still have exactly one frontmatter section after second update');

            // Third update - should still not accumulate
            const todos3: TodoItem[] = [
                { id: 'bug-test-2', content: 'Second todo', status: 'completed', priority: 'medium' },
                { id: 'bug-test-3', content: 'Third todo', status: 'in_progress', priority: 'low' }
            ];
            await writer.updateInstructionsWithTodos(todos3, 'Third Update');

            content = fs.readFileSync(filePath, 'utf8');
            frontmatterCount = (content.match(/^---\n/gm) || []).length;
            assert.strictEqual(frontmatterCount, 1, 'Should still have exactly one frontmatter section after third update');

            // Verify content structure is correct
            assert.ok(content.startsWith('---\napplyTo: \'**\'\n---\n\n'));
            assert.ok(content.includes('Third Update'));
            assert.ok(content.includes('Third todo'));
            assert.ok(content.includes('in_progress'));
        });

        test('Should preserve custom frontmatter across multiple updates', async () => {
            const writer = new StandaloneCopilotWriter(tempDir);
            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            
            // Create initial file with custom frontmatter
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            const initialContent = `---
title: Custom Instructions
applyTo: '*.ts'
version: 2.0
author: test
---

# Custom Instructions

Some custom content.
`;
            fs.writeFileSync(filePath, initialContent, 'utf8');

            // Multiple updates should preserve the custom frontmatter
            for (let i = 1; i <= 3; i++) {
                const todos: TodoItem[] = [
                    { id: `preserve-${i}`, content: `Update ${i} todo`, status: 'pending', priority: 'medium' }
                ];
                await writer.updateInstructionsWithTodos(todos, `Update ${i}`);

                const content = fs.readFileSync(filePath, 'utf8');
                
                // Should preserve all custom frontmatter fields
                assert.ok(content.includes('title: Custom Instructions'));
                assert.ok(content.includes('applyTo: \'*.ts\''));
                assert.ok(content.includes('version: 2.0'));
                assert.ok(content.includes('author: test'));
                
                // Should not have our default frontmatter
                assert.strictEqual(content.indexOf('applyTo: \'**\''), -1);
                
                // Should have only one frontmatter section
                const frontmatterCount = (content.match(/^---\n/gm) || []).length;
                assert.strictEqual(frontmatterCount, 1, `Should have exactly one frontmatter section after update ${i}`);
                
                // Should include the updated todo
                assert.ok(content.includes(`Update ${i} todo`));
                assert.ok(content.includes('# Custom Instructions'));
                assert.ok(content.includes('Some custom content.'));
            }
        });
    });
});
