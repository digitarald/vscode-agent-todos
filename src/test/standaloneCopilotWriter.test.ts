import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StandaloneCopilotWriter } from '../mcp/standaloneCopilotWriter';
import { TodoItem } from '../types';

suite('StandaloneCopilotWriter Tests', () => {
    let tempDir: string;
    let writer: StandaloneCopilotWriter;

    setup(() => {
        // Create temp directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-writer-test-'));
        writer = new StandaloneCopilotWriter(tempDir);
    });

    teardown(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    suite('Frontmatter Detection', () => {
        test('Should detect when frontmatter is missing', () => {
            const content = '<todos>Some content</todos>';
            const hasFrontmatterMethod = (writer as any).hasFrontmatter.bind(writer);
            
            const result = hasFrontmatterMethod(content);
            assert.strictEqual(result, false);
        });

        test('Should detect when frontmatter is present', () => {
            const content = `---
applyTo: '**'
---

<todos>Some content</todos>`;
            const hasFrontmatterMethod = (writer as any).hasFrontmatter.bind(writer);
            
            const result = hasFrontmatterMethod(content);
            assert.strictEqual(result, true);
        });

        test('Should detect frontmatter with different content', () => {
            const content = `---
title: My Instructions
applyTo: '*.ts'
---

Some content here`;
            const hasFrontmatterMethod = (writer as any).hasFrontmatter.bind(writer);
            
            const result = hasFrontmatterMethod(content);
            assert.strictEqual(result, true);
        });

        test('Should not detect false positives', () => {
            const content = `This is not frontmatter
---
Even though it has dashes
---
It should not be detected as frontmatter`;
            const hasFrontmatterMethod = (writer as any).hasFrontmatter.bind(writer);
            
            const result = hasFrontmatterMethod(content);
            assert.strictEqual(result, false);
        });
    });

    suite('Frontmatter Addition', () => {
        test('Should add frontmatter to content without it', () => {
            const content = '<todos>Some todos</todos>';
            const addFrontmatterMethod = (writer as any).addFrontmatter.bind(writer);
            
            const result = addFrontmatterMethod(content);
            
            assert.ok(result.startsWith('---\napplyTo: \'**\'\n---\n\n'));
            assert.ok(result.includes('<todos>Some todos</todos>'));
        });

        test('Should preserve existing frontmatter', () => {
            const content = `---
title: Existing
applyTo: '*.js'
---

<todos>Some todos</todos>`;
            const addFrontmatterMethod = (writer as any).addFrontmatter.bind(writer);
            
            const result = addFrontmatterMethod(content);
            
            assert.strictEqual(result, content); // Should be unchanged
            assert.ok(result.includes('title: Existing'));
            assert.ok(result.includes('applyTo: \'*.js\''));
        });

        test('Should not accumulate frontmatter on multiple updates', () => {
            // Simulate multiple updates to the same file content
            const hasMethod = (writer as any).hasFrontmatter.bind(writer);
            
            // Initial content with our frontmatter
            let content = `---
applyTo: '**'
---

<todos>Initial todos</todos>
Some existing content`;

            // First update - should preserve frontmatter
            const hasFrontmatter1 = hasMethod(content);
            assert.strictEqual(hasFrontmatter1, true, 'Should detect existing frontmatter');

            // Simulate removing todos and re-adding (like in updateInstructionsWithTodos)
            const contentWithoutTodos = content.replace(/<todos[^>]*>[\s\S]*?<\/todos>\s*\n?/, '');
            const newTodos = '<todos>Updated todos</todos>\n\n';
            
            // Check frontmatter before prepending todos
            const frontmatterMatch = content.match(/^(---\n.*?\n---\n\n?)/s);
            assert.ok(frontmatterMatch, 'Should match frontmatter regex');
            
            const frontmatter = frontmatterMatch[1];
            const contentAfterFrontmatter = contentWithoutTodos.replace(frontmatterMatch[1], '');
            const finalContent = frontmatter + newTodos + contentAfterFrontmatter;

            // Should still have only one frontmatter section
            const frontmatterCount = (finalContent.match(/^---\n/gm) || []).length;
            assert.strictEqual(frontmatterCount, 1, 'Should have exactly one frontmatter section');
            
            assert.ok(finalContent.includes('Updated todos'));
            assert.ok(finalContent.includes('Some existing content'));
        });
    });

    suite('File Operations with Frontmatter', () => {
        test('Should add frontmatter to new file', async () => {
            const todos: TodoItem[] = [
                { id: 'test-1', content: 'Test todo', status: 'pending', priority: 'medium' }
            ];

            await writer.updateInstructionsWithTodos(todos, 'Test Title');

            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            assert.ok(fs.existsSync(filePath), 'File should be created');

            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.startsWith('---\napplyTo: \'**\'\n---\n\n'));
            assert.ok(content.includes('<todos title="Test Title"'));
            assert.ok(content.includes('Test todo'));
        });

        test('Should preserve existing frontmatter when updating', async () => {
            const filePath = path.join(tempDir, '.github/instructions/todos.instructions.md');
            
            // Create directory first
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            
            // Write initial content with custom frontmatter
            const initialContent = `---
title: Custom Instructions
applyTo: '*.ts'
customField: value
---

Some existing content
`;
            fs.writeFileSync(filePath, initialContent, 'utf8');

            const todos: TodoItem[] = [
                { id: 'test-1', content: 'New todo', status: 'pending', priority: 'high' }
            ];

            await writer.updateInstructionsWithTodos(todos);

            const updatedContent = fs.readFileSync(filePath, 'utf8');
            
            // Should preserve custom frontmatter
            assert.ok(updatedContent.includes('title: Custom Instructions'));
            assert.ok(updatedContent.includes('applyTo: \'*.ts\''));
            assert.ok(updatedContent.includes('customField: value'));
            
            // Should include new todos
            assert.ok(updatedContent.includes('<todos rule='));
            assert.ok(updatedContent.includes('New todo'));
            
            // Should preserve existing content
            assert.ok(updatedContent.includes('Some existing content'));
        });

        test('Should handle nested directory creation', async () => {
            const customWriter = new StandaloneCopilotWriter(tempDir, 'deep/nested/path/todos.md');
            const todos: TodoItem[] = [
                { id: 'test-1', content: 'Deep todo', status: 'pending', priority: 'low' }
            ];

            await customWriter.updateInstructionsWithTodos(todos);

            const filePath = path.join(tempDir, 'deep/nested/path/todos.md');
            assert.ok(fs.existsSync(filePath), 'File should be created in nested directory');

            const content = fs.readFileSync(filePath, 'utf8');
            assert.ok(content.startsWith('---\napplyTo: \'**\'\n---\n\n'));
            assert.ok(content.includes('Deep todo'));
        });
    });
});
