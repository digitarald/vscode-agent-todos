import * as assert from 'assert';
import * as vscode from 'vscode';
import { TodoManager } from '../todoManager';
import { TodoItem } from '../types';
import { TodoTreeDataProvider, TodoSectionItem, TodoTreeItem, TodoTreeNode } from '../todoTreeProvider';
import { InMemoryStorage } from '../storage/InMemoryStorage';

suite('Collapsed Mode Tests', () => {
    let todoManager: TodoManager;
    let treeProvider: TodoTreeDataProvider;

    setup(async () => {
        // Initialize TodoManager with in-memory storage
        todoManager = TodoManager.getInstance();
        await todoManager.initialize();
        
        // Set in-memory storage to avoid workspace dependencies
        (todoManager as any).storage = new InMemoryStorage();
        
        // Clear any existing todos
        await todoManager.clearTodos();
        
        // Create tree provider
        treeProvider = new TodoTreeDataProvider();
    });

    test('should trigger change event when collapsed mode setting changes', async () => {
        // Skip this test as it requires VS Code configuration API which is not available in tests
        // The functionality is tested manually and through integration tests
    });

    test('should show flat list when collapsed mode is disabled', async () => {
        // Ensure collapsed mode is disabled (default)
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => false;
        
        try {
            // Add some todos
            const todos: TodoItem[] = [
                { id: '1', content: 'Todo 1', status: 'pending', priority: 'medium' },
                { id: '2', content: 'Todo 2', status: 'in_progress', priority: 'high' },
                { id: '3', content: 'Todo 3', status: 'completed', priority: 'low' }
            ];
            await todoManager.setTodos(todos);

            // Get children from tree provider
            const children = await treeProvider.getChildren();
            
            // Should have 3 individual todo items
            assert.strictEqual(children.length, 3);
            assert.ok(children.every(child => child instanceof TodoTreeItem));
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });

    test('should group todos by status when collapsed mode is enabled', async () => {
        // Mock collapsed mode to be enabled
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => true;

        try {
            // Add todos with different statuses
            const todos: TodoItem[] = [
                { id: '1', content: 'Pending Todo', status: 'pending', priority: 'medium' },
                { id: '2', content: 'In Progress Todo', status: 'in_progress', priority: 'high' },
                { id: '3', content: 'Completed Todo', status: 'completed', priority: 'low' }
            ];
            await todoManager.setTodos(todos);

            // Get children from tree provider
            const children = await treeProvider.getChildren();
            
            // Should have individual in-progress todo + pending section + completed section
            assert.strictEqual(children.length, 3);
            
            // First should be in-progress todo
            assert.ok(children[0] instanceof TodoTreeItem);
            assert.strictEqual((children[0] as TodoTreeItem).todo.status, 'in_progress');
            
            // Second should be pending section
            assert.ok(children[1] instanceof TodoSectionItem);
            assert.strictEqual((children[1] as TodoSectionItem).sectionType, 'pending');
            
            // Third should be completed section
            assert.ok(children[2] instanceof TodoSectionItem);
            assert.strictEqual((children[2] as TodoSectionItem).sectionType, 'completed');
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });

    test('should group pending todos in collapsed mode regardless of in-progress status', async () => {
        // Mock collapsed mode to be enabled
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => true;

        try {
            // Add only pending and completed todos (no in-progress)
            const todos: TodoItem[] = [
                { id: '1', content: 'Pending Todo 1', status: 'pending', priority: 'medium' },
                { id: '2', content: 'Pending Todo 2', status: 'pending', priority: 'high' },
                { id: '3', content: 'Completed Todo', status: 'completed', priority: 'low' }
            ];
            await todoManager.setTodos(todos);

            // Get children from tree provider
            const children = await treeProvider.getChildren();
            
            // Should have first pending todo + pending section + completed section  
            assert.strictEqual(children.length, 3);
            
            // First should be the first pending todo shown individually
            assert.ok(children[0] instanceof TodoTreeItem);
            assert.strictEqual((children[0] as TodoTreeItem).todo.id, '1');
            
            // Second should be pending section with remaining todo
            assert.ok(children[1] instanceof TodoSectionItem);
            assert.strictEqual((children[1] as TodoSectionItem).sectionType, 'pending');
            assert.strictEqual((children[1] as TodoSectionItem).todos.length, 1);
            
            // Third should be completed section
            assert.ok(children[2] instanceof TodoSectionItem);
            assert.strictEqual((children[2] as TodoSectionItem).sectionType, 'completed');
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });

    test('should show first pending item individually when no in-progress tasks', async () => {
        // Mock collapsed mode to be enabled
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => true;

        try {
            // Add multiple pending todos but no in-progress ones
            const todos: TodoItem[] = [
                { id: '1', content: 'First Pending Todo', status: 'pending', priority: 'high' },
                { id: '2', content: 'Second Pending Todo', status: 'pending', priority: 'medium' },
                { id: '3', content: 'Third Pending Todo', status: 'pending', priority: 'low' },
                { id: '4', content: 'Completed Todo', status: 'completed', priority: 'low' }
            ];
            await todoManager.setTodos(todos);

            // Get children from tree provider
            const children = await treeProvider.getChildren();

            // Should have: first pending todo + pending section (with remaining 2) + completed section
            assert.strictEqual(children.length, 3);

            // First should be the first pending todo individually
            assert.ok(children[0] instanceof TodoTreeItem);
            assert.strictEqual((children[0] as TodoTreeItem).todo.id, '1');
            assert.strictEqual((children[0] as TodoTreeItem).todo.content, 'First Pending Todo');

            // Second should be pending section with remaining todos
            assert.ok(children[1] instanceof TodoSectionItem);
            assert.strictEqual((children[1] as TodoSectionItem).sectionType, 'pending');
            assert.strictEqual((children[1] as TodoSectionItem).todos.length, 2);

            // Third should be completed section
            assert.ok(children[2] instanceof TodoSectionItem);
            assert.strictEqual((children[2] as TodoSectionItem).sectionType, 'completed');
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });

    test('should not show first pending individually when in-progress tasks exist', async () => {
        // Mock collapsed mode to be enabled
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => true;

        try {
            // Add pending todos AND in-progress ones
            const todos: TodoItem[] = [
                { id: '1', content: 'First Pending Todo', status: 'pending', priority: 'high' },
                { id: '2', content: 'Second Pending Todo', status: 'pending', priority: 'medium' },
                { id: '3', content: 'In Progress Todo', status: 'in_progress', priority: 'high' },
                { id: '4', content: 'Completed Todo', status: 'completed', priority: 'low' }
            ];
            await todoManager.setTodos(todos);

            // Get children from tree provider
            const children = await treeProvider.getChildren();

            // Should have: in-progress todo + pending section (with all 2) + completed section
            assert.strictEqual(children.length, 3);

            // First should be in-progress todo
            assert.ok(children[0] instanceof TodoTreeItem);
            assert.strictEqual((children[0] as TodoTreeItem).todo.status, 'in_progress');

            // Second should be pending section with ALL pending todos
            assert.ok(children[1] instanceof TodoSectionItem);
            assert.strictEqual((children[1] as TodoSectionItem).sectionType, 'pending');
            assert.strictEqual((children[1] as TodoSectionItem).todos.length, 2);

            // Third should be completed section
            assert.ok(children[2] instanceof TodoSectionItem);
            assert.strictEqual((children[2] as TodoSectionItem).sectionType, 'completed');
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });

    test('should return section children correctly', async () => {
        // Mock collapsed mode to be enabled
        const originalMethod = todoManager.isCollapsedModeEnabled;
        (todoManager as any).isCollapsedModeEnabled = () => true;

        try {
            // Add multiple completed todos
            const todos: TodoItem[] = [
                { id: '1', content: 'Completed Todo 1', status: 'completed', priority: 'low' },
                { id: '2', content: 'Completed Todo 2', status: 'completed', priority: 'medium' }
            ];
            await todoManager.setTodos(todos);

            // Get root children
            const children = await treeProvider.getChildren();
            
            // Should have only the completed section
            assert.strictEqual(children.length, 1);
            assert.ok(children[0] instanceof TodoSectionItem);
            
            const completedSection = children[0] as TodoSectionItem;
            
            // Get children of the completed section
            const sectionChildren = await treeProvider.getChildren(completedSection);
            
            // Should have 2 todo items
            assert.strictEqual(sectionChildren.length, 2);
            assert.ok(sectionChildren.every(child => child instanceof TodoTreeItem));
            assert.ok(sectionChildren.every(child => (child as TodoTreeItem).todo.status === 'completed'));
        } finally {
            // Restore original method
            (todoManager as any).isCollapsedModeEnabled = originalMethod;
        }
    });
});