import * as assert from 'assert';
import { TodoManager } from '../todoManager';
import { StandaloneTodoManager } from '../mcp/standaloneTodoManager';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { TodoItem } from '../types';
import { getMockExtensionContext } from './testUtils';

suite('Deduplication Integration Tests', () => {
    suite('TodoManager Deduplication', () => {
        let todoManager: TodoManager;

        setup(async () => {
            // Reset TodoManager singleton for testing
            (TodoManager as any).instance = undefined;
            todoManager = TodoManager.getInstance();
            
            const mockContext = getMockExtensionContext();
            await todoManager.initialize(mockContext);
            await todoManager.clearTodos();
            await todoManager.clearSavedLists();
        });

        teardown(async () => {
            if (todoManager) {
                await todoManager.clearTodos();
                await todoManager.clearSavedLists();
                todoManager.dispose();
            }
        });

        test('should prevent exact duplicate saves in TodoManager', async () => {
            const todos: TodoItem[] = [
                {
                    id: 'task-1',
                    content: 'Test task',
                    status: 'pending',
                    priority: 'medium'
                }
            ];

            // Save initial list by changing title
            await todoManager.setTodos(todos, 'Test Project');
            await todoManager.setTodos([], 'New Project'); // This should save 'Test Project'

            let savedLists = todoManager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should have one saved list');

            // Attempt to save identical list again - should be prevented
            await todoManager.setTodos(todos, 'Test Project');
            await todoManager.setTodos([], 'Another Project'); // This should be prevented due to duplicate

            savedLists = todoManager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should still have only one saved list - duplicate prevented');
            assert.strictEqual(savedLists[0].title, 'Test Project');
            assert.strictEqual(savedLists[0].todos.length, 1);
        });

        test('should allow saves when todo status differs in TodoManager', async () => {
            const todosV1: TodoItem[] = [{
                id: 'task-1',
                content: 'Test task',
                status: 'pending',
                priority: 'medium'
            }];

            const todosV2: TodoItem[] = [{
                id: 'task-1',
                content: 'Test task',
                status: 'completed',
                priority: 'medium'
            }];

            // Save initial list with pending task
            await todoManager.setTodos(todosV1, 'Test Project');
            await todoManager.setTodos([], 'New Project');

            // Save list with completed task - should be allowed
            await todoManager.setTodos(todosV2, 'Test Project');
            await todoManager.setTodos([], 'Final Project');

            const savedLists = todoManager.getSavedLists();
            assert.strictEqual(savedLists.length, 2, 'Should have two saved lists - different status should be allowed');
            
            // Verify both versions exist
            const pendingVersion = savedLists.find(list => list.todos[0].status === 'pending');
            const completedVersion = savedLists.find(list => list.todos[0].status === 'completed');
            assert.ok(pendingVersion, 'Should have pending version');
            assert.ok(completedVersion, 'Should have completed version');
        });
    });

    suite('StandaloneTodoManager Deduplication', () => {
        let manager: StandaloneTodoManager;

        setup(() => {
            const storage = new InMemoryStorage();
            manager = new StandaloneTodoManager(storage);
        });

        teardown(() => {
            if (manager) {
                manager.dispose();
            }
        });

        test('should prevent exact duplicate saves in StandaloneTodoManager', async () => {
            const todos: TodoItem[] = [{
                id: 'task-1',
                content: 'Test task',
                status: 'pending',
                priority: 'medium'
            }];

            // Save initial list
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'New Project'); // This should save 'Test Project'

            let savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should have one saved list');

            // Attempt to save identical list again - should be prevented
            await manager.updateTodos(todos, 'Test Project');
            await manager.updateTodos([], 'Another Project'); // This should be prevented

            savedLists = manager.getSavedLists();
            assert.strictEqual(savedLists.length, 1, 'Should still have only one saved list - duplicate prevented');
        });
    });
});
