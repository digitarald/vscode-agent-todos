import * as assert from 'assert';
import { generateSlug, generateUniqueSlug } from '../../utils/slugUtils';

suite('SlugUtils Test Suite', () => {
    test('generateSlug should create URL-safe slugs', () => {
        assert.strictEqual(generateSlug('Hello World'), 'hello-world');
        assert.strictEqual(generateSlug('Project: Web App'), 'project-web-app');
        assert.strictEqual(generateSlug('Feature #123'), 'feature-123');
        assert.strictEqual(generateSlug('Bug Fix (Critical)'), 'bug-fix-critical');
    });

    test('generateSlug should handle edge cases', () => {
        assert.strictEqual(generateSlug(''), 'untitled');
        assert.strictEqual(generateSlug('   '), 'untitled');
        assert.strictEqual(generateSlug('---'), 'untitled');
        assert.strictEqual(generateSlug('Special!@#$%^&*()Characters'), 'special-characters');
    });

    test('generateSlug should limit length', () => {
        const longTitle = 'This is a very long title that should be truncated to ensure it fits within the 50 character limit';
        const slug = generateSlug(longTitle);
        assert.ok(slug.length <= 50);
        assert.ok(!slug.endsWith('-'));
    });

    test('generateUniqueSlug should return base slug when no conflicts', () => {
        const existingSlugs = new Set(['other-slug', 'different-slug']);
        assert.strictEqual(generateUniqueSlug('New Project', existingSlugs), 'new-project');
    });

    test('generateUniqueSlug should append number when slug exists', () => {
        const existingSlugs = new Set(['project-alpha', 'project-alpha-1', 'project-alpha-2']);
        assert.strictEqual(generateUniqueSlug('Project Alpha', existingSlugs), 'project-alpha-3');
    });

    test('generateUniqueSlug should find first available number', () => {
        const existingSlugs = new Set(['test-slug', 'test-slug-1', 'test-slug-3']);
        assert.strictEqual(generateUniqueSlug('Test Slug', existingSlugs), 'test-slug-2');
    });
});