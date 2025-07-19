/**
 * Manual test script for archive functionality
 */

import { StandaloneTodoManager } from '../src/mcp/standaloneTodoManager';
import { InMemoryStorage } from '../src/storage/InMemoryStorage';
import { TodoItem } from '../src/types';
import { TodoMarkdownFormatter } from '../src/utils/todoMarkdownFormatter';

async function testArchiveFunctionality() {
    console.log('🧪 Testing Archive Functionality...\n');

    const storage = new InMemoryStorage();
    const manager = new StandaloneTodoManager(storage);

    // Test 1: Create initial todo list
    console.log('📝 Step 1: Creating initial todo list...');
    const todos1: TodoItem[] = [
        {
            id: 'task-1',
            content: 'Implement user authentication',
            status: 'in_progress',
            priority: 'high'
        },
        {
            id: 'task-2',
            content: 'Write unit tests',
            status: 'pending',
            priority: 'medium'
        }
    ];

    await manager.updateTodos(todos1, 'Project Alpha - Auth Module');
    console.log(`✅ Created list "${manager.getTitle()}" with ${manager.getTodos().length} todos`);

    // Test 2: Change title to trigger archive
    console.log('\n📦 Step 2: Changing title to trigger archive...');
    const todos2: TodoItem[] = [
        {
            id: 'task-3',
            content: 'Design new UI components',
            status: 'pending',
            priority: 'medium'
        }
    ];

    await manager.updateTodos(todos2, 'Project Beta - UI Redesign');
    console.log(`✅ Created new list "${manager.getBaseTitle()}" with ${manager.getTodos().length} todos`);

    // Test 3: Check archived lists
    console.log('\n📚 Step 3: Checking archived lists...');
    const archives = manager.getArchivedLists();
    console.log(`✅ Found ${archives.length} archived list(s)`);

    if (archives.length > 0) {
        const archive = archives[0];
        console.log(`📋 Archive: "${archive.title}" (slug: ${archive.slug})`);
        console.log(`   - Archived at: ${archive.archivedAt.toISOString()}`);
        console.log(`   - Todo count: ${archive.todos.length}`);
        
        // Test markdown formatting
        const markdown = TodoMarkdownFormatter.formatTodosAsMarkdown(
            archive.todos, 
            `${archive.title} (Archived ${archive.archivedAt.toLocaleDateString()})`
        );
        console.log('\n📄 Archived list as markdown:');
        console.log('---');
        console.log(markdown);
        console.log('---');
    }

    // Test 4: Archive retrieval by slug
    console.log('\n🔍 Step 4: Testing archive retrieval by slug...');
    const slugs = manager.getArchivedListSlugs();
    console.log(`✅ Available slugs: ${slugs.join(', ')}`);

    if (slugs.length > 0) {
        const retrieved = manager.getArchivedListBySlug(slugs[0]);
        if (retrieved) {
            console.log(`✅ Successfully retrieved archive: "${retrieved.title}"`);
        } else {
            console.log('❌ Failed to retrieve archive');
        }
    }

    // Test 5: Multiple archives
    console.log('\n🔄 Step 5: Creating multiple archives...');
    await manager.updateTodos(todos1, 'Project Gamma - Testing');
    await manager.updateTodos(todos2, 'Project Delta - Deployment');
    
    const finalArchives = manager.getArchivedLists();
    console.log(`✅ Total archives: ${finalArchives.length}`);
    
    finalArchives.forEach((archive, index) => {
        console.log(`   ${index + 1}. "${archive.title}" (${archive.slug}) - ${archive.todos.length} todos`);
    });

    console.log('\n🎉 Archive functionality test completed!');
    manager.dispose();
}

// Run the test
testArchiveFunctionality().catch(console.error);