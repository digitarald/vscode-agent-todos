/**
 * Utility functions for generating slugs from todo list titles
 */

/**
 * Generate a URL-safe slug from a title
 * @param title The title to convert to a slug
 * @returns A URL-safe slug
 */
export function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .trim()
        // Replace spaces and special chars with hyphens
        .replace(/[\s\W]+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Limit length to 50 characters
        .substring(0, 50)
        // Ensure it doesn't end with a hyphen after truncation
        .replace(/-+$/, '')
        // Default to 'untitled' if empty
        || 'untitled';
}

/**
 * Generate a unique slug that doesn't conflict with existing slugs
 * @param title The title to convert to a slug
 * @param existingSlugs Set of already used slugs
 * @returns A unique URL-safe slug
 */
export function generateUniqueSlug(title: string, existingSlugs: Set<string>): string {
    const baseSlug = generateSlug(title);
    
    if (!existingSlugs.has(baseSlug)) {
        return baseSlug;
    }
    
    // If slug exists, append a number
    let counter = 1;
    let uniqueSlug = `${baseSlug}-${counter}`;
    
    while (existingSlugs.has(uniqueSlug)) {
        counter++;
        uniqueSlug = `${baseSlug}-${counter}`;
    }
    
    return uniqueSlug;
}