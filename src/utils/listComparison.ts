import { SavedTodoList, TodoItem } from '../types';

/**
 * Compare two SavedTodoList objects for exact content match.
 * Returns true only if title and all todo properties are identical.
 * Ignores id, savedAt, and slug differences.
 */
export function areListsExactMatch(list1: SavedTodoList, list2: SavedTodoList): boolean {
    // Early exit on title mismatch
    if (list1.title !== list2.title) {
        return false;
    }

    // Early exit on todo count mismatch
    if (list1.todos.length !== list2.todos.length) {
        return false;
    }

    // Compare each todo in order
    for (let i = 0; i < list1.todos.length; i++) {
        if (!areTodosExactMatch(list1.todos[i], list2.todos[i])) {
            return false;
        }
    }

    return true;
}

/**
 * Compare two TodoItem objects for exact match.
 * All properties including status must match exactly.
 */
function areTodosExactMatch(todo1: TodoItem, todo2: TodoItem): boolean {
    return (
        todo1.id === todo2.id &&
        todo1.content === todo2.content &&
        todo1.status === todo2.status &&
        todo1.priority === todo2.priority &&
        todo1.adr === todo2.adr
    );
}
