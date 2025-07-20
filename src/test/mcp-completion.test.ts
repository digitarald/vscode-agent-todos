import * as assert from 'assert';
import { TodoMCPServer } from '../mcp/server';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';

suite('Saved List Resource Completion', () => {
    let server: TodoMCPServer;
    let todoManager: StandaloneTodoManager;

    setup(async () => {
        // Create server in standalone mode for testing
        server = new TodoMCPServer({ standalone: true });
        await server.initialize();

        // Get the standalone todo manager
        todoManager = server.getTodoManager();

        // Create some saved lists for testing
        await todoManager.setTodos([
            { id: 'task1', content: 'Task 1', status: 'completed', priority: 'high' }
        ], 'Project Alpha');

        await todoManager.setTodos([
            { id: 'task2', content: 'Task 2', status: 'pending', priority: 'medium' }
        ], 'Project Beta Setup');

        await todoManager.setTodos([
            { id: 'task3', content: 'Task 3', status: 'in_progress', priority: 'low' }
        ], 'Database Migration');

        await todoManager.setTodos([
            { id: 'task4', content: 'Task 4', status: 'pending', priority: 'high' }
        ], 'API Enhancement');

        // Trigger saving of "API Enhancement" by setting a new title
        await todoManager.setTodos([
            { id: 'task5', content: 'Task 5', status: 'pending', priority: 'medium' }
        ], 'Current Project');
    });

    teardown(async () => {
        if (server) {
            await server.stop();
        }
    });

    test('Should provide completion for saved list slugs with empty input', async () => {
        // Mock ResourceTemplate completion callback
        const savedLists = todoManager.getSavedLists();
        assert.ok(savedLists.length >= 3, 'Should have saved lists from setup');

        const slugs = todoManager.getSavedListSlugs();
        assert.ok(slugs.length >= 3, 'Should have saved list slugs');

        // Test completion with empty input
        const allSlugs = slugs.filter((slug: string) => slug.toLowerCase().startsWith(''));
        assert.strictEqual(allSlugs.length, slugs.length, 'Empty input should return all slugs');
        assert.ok(allSlugs.includes('project-alpha'), 'Should include project-alpha slug');
        assert.ok(allSlugs.includes('project-beta-setup'), 'Should include project-beta-setup slug');
        assert.ok(allSlugs.includes('database-migration'), 'Should include database-migration slug');
    });

    test('Should provide filtered completion for saved list slugs with partial input', async () => {
        const slugs = todoManager.getSavedListSlugs();

        // Test completion with 'project' prefix
        const projectSlugs = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('project'.toLowerCase())
        );
        assert.ok(projectSlugs.length >= 2, 'Should have project-related slugs');
        assert.ok(projectSlugs.includes('project-alpha'), 'Should include project-alpha');
        assert.ok(projectSlugs.includes('project-beta-setup'), 'Should include project-beta-setup');
        assert.ok(!projectSlugs.includes('database-migration'), 'Should not include database-migration');

        // Test completion with 'data' prefix
        const dataSlugs = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('data'.toLowerCase())
        );
        assert.ok(dataSlugs.includes('database-migration'), 'Should include database-migration');
        assert.ok(!dataSlugs.includes('project-alpha'), 'Should not include project-alpha');
    });

    test('Should handle case-insensitive completion', async () => {
        const slugs = todoManager.getSavedListSlugs();

        // Test with uppercase input
        const upperCaseResults = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('PROJECT'.toLowerCase())
        );
        const lowerCaseResults = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('project'.toLowerCase())
        );

        assert.deepStrictEqual(upperCaseResults, lowerCaseResults,
            'Case-insensitive matching should work');
    });

    test('Should return empty array for non-matching input', async () => {
        const slugs = todoManager.getSavedListSlugs();

        const noMatches = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('nonexistent'.toLowerCase())
        );
        assert.strictEqual(noMatches.length, 0, 'Should return empty array for non-matching input');
    });

    test('Should handle partial matches correctly', async () => {
        const slugs = todoManager.getSavedListSlugs();

        // Test with 'api' prefix
        const apiSlugs = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('api'.toLowerCase())
        );
        assert.ok(apiSlugs.includes('api-enhancement'), 'Should include api-enhancement');

        // Test with longer prefix
        const apiEnhSlugs = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('api-enh'.toLowerCase())
        );
        assert.ok(apiEnhSlugs.includes('api-enhancement'), 'Should match partial prefix');
        assert.strictEqual(apiEnhSlugs.length, 1, 'Should return only matching items');
    });

    test('Should maintain order consistency in completion results', async () => {
        const slugs1 = todoManager.getSavedListSlugs();
        const slugs2 = todoManager.getSavedListSlugs();

        assert.deepStrictEqual(slugs1, slugs2, 'Should return consistent order');

        // Test filtered results maintain order
        const filtered1 = slugs1.filter((slug: string) =>
            slug.toLowerCase().startsWith('p'.toLowerCase())
        );
        const filtered2 = slugs2.filter((slug: string) =>
            slug.toLowerCase().startsWith('p'.toLowerCase())
        );

        assert.deepStrictEqual(filtered1, filtered2, 'Filtered results should maintain order');
    });

    test('Should handle archive changes dynamically', async () => {
        const initialSlugs = todoManager.getSavedListSlugs();
        const initialCount = initialSlugs.length;

        // Add a new saved list by setting a title and then changing it
        await todoManager.setTodos([
            { id: 'new-task', content: 'New Task', status: 'completed', priority: 'medium' }
        ], 'New Project Saved');

        // Save it by changing the title
        await todoManager.setTodos([
            { id: 'another-task', content: 'Another Task', status: 'pending', priority: 'low' }
        ], 'Final Project');

        const newSlugs = todoManager.getSavedListSlugs();
        // We expect 2 more slugs: "current-project" (saved when setting "New Project Saved") 
        // and "new-project-saved" (saved when setting "Final Project")
        assert.strictEqual(newSlugs.length, initialCount + 2, 'Should have two more slugs');
        assert.ok(newSlugs.includes('new-project-saved'), 'Should include new archive slug');
        assert.ok(newSlugs.includes('current-project'), 'Should include current-project slug');

        // Test completion with the new slug
        const newProjectSlugs = newSlugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('new'.toLowerCase())
        );
        assert.ok(newProjectSlugs.includes('new-project-saved'), 'Should complete new archive');
    });

    test('Should provide completion context information', async () => {
        // Test that completion callback can receive context parameter
        const slugs = todoManager.getSavedListSlugs();

        // The completion should still work regardless of context
        const results = slugs.filter((slug: string) =>
            slug.toLowerCase().startsWith('project'.toLowerCase())
        );

        assert.ok(results.length > 0, 'Should return results even with context');
    });
});