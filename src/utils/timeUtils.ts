/**
 * Utility functions for time formatting
 */

/**
 * Format a date as a human-readable relative time (ago-style)
 * @param date The date to format
 * @returns A human-readable relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffYear > 0) {
        return diffYear === 1 ? '1 year ago' : `${diffYear} years ago`;
    }
    if (diffMonth > 0) {
        return diffMonth === 1 ? '1 month ago' : `${diffMonth} months ago`;
    }
    if (diffWeek > 0) {
        return diffWeek === 1 ? '1 week ago' : `${diffWeek} weeks ago`;
    }
    if (diffDay > 0) {
        return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
    }
    if (diffHour > 0) {
        return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
    }
    if (diffMin > 0) {
        return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
    }
    return 'just now';
}

/**
 * Count completed todos in a list
 * @param todos Array of TodoItem objects
 * @returns Object with completed count and total count
 */
export function getCompletionStats(todos: any[]): { completed: number; total: number } {
    const completed = todos.filter(todo => todo.status === 'completed').length;
    const total = todos.length;
    return { completed, total };
}