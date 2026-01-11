import { test } from 'node:test';
import assert from 'node:assert';
import { parseFrontmatter } from '../../server/core/util.js';

test('Core Util - parseFrontmatter()', async t => {
	await t.test('should parse basic key-value pairs', () => {
		const input = '---\ntitle: "Hello World"\nurl: https://example.com\n---\nBody text';
		const { meta, body } = parseFrontmatter(input);
		assert.strictEqual(meta.title, 'Hello World');
		assert.strictEqual(meta.url, 'https://example.com');
		assert.strictEqual(body, 'Body text');
	});

	await t.test('should parse list items (tags) and normalize to array', () => {
		const input = '---\ntags:\n  - clipping\n  - science\n  created: 2026-04-16\n---\nContent';
		const { meta } = parseFrontmatter(input);
		assert.deepStrictEqual(meta.tags, ['clipping', 'science']);
		assert.strictEqual(typeof meta.created, 'number');
	});

	await t.test('should handle comma-separated strings as tags', () => {
		const input = '---\ntags: "apple, banana, cherry"\n---\nContent';
		const { meta } = parseFrontmatter(input);
		assert.deepStrictEqual(meta.tags, ['apple', 'banana', 'cherry']);
	});

	await t.test('should handle inline tags and list tags mixed', () => {
		const input = '---\ntags: first\n  - second\n---\nContent';
		const { meta } = parseFrontmatter(input);
		assert.deepStrictEqual(meta.tags, ['first', 'second']);
	});

	await t.test('should handle missing frontmatter', () => {
		const input = 'Just plain text';
		const { meta, body } = parseFrontmatter(input);
		assert.deepStrictEqual(meta, {});
		assert.strictEqual(body, 'Just plain text');
	});

	await t.test('should handle empty frontmatter', () => {
		const input = '---\n---\nBody content';
		const { meta, body } = parseFrontmatter(input);
		assert.deepStrictEqual(meta, {});
		assert.strictEqual(body, 'Body content');
	});

	await t.test('should handle different newline styles', () => {
		const input = '---\r\ntitle: Windows\r\n---\r\nContent';
		const { meta, body } = parseFrontmatter(input);
		assert.strictEqual(meta.title, 'Windows');
		assert.strictEqual(body, 'Content');
	});
});
