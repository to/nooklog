import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sentence from '../../server/core/sentence/index.js';

test('Markdown Chunking Logic - Snapshot Consistency', async t => {
	const md = await fs.readFile(new URL('./example.md', import.meta.url), 'utf-8');

	const chunks = sentence.chunkMarkdown(md, {
		targetSize: 400,
		limitSize: 1200,
		overlapSize: 30,
	});

	await t.test('Verify total number of chunks', () => {
		assert.strictEqual(chunks.length, 10, 'Total chunks should be 10 with targetSize=400');
	});

	await t.test('Verify metadata in first chunk', () => {
		const c = chunks[0];
		assert.strictEqual(c.titles[0], 'Markdown Chunking Benchmark Document', 'Metadata title should be inherited from YAML');
		assert.strictEqual(c.depth, 1, 'First chunk should be H1');
	});

	await t.test('Verify deeply nested heading chunk (Index 2)', () => {
		const target = chunks[2];

		// パンくずリスト（タイトルの蓄積）のチェック
		assert.strictEqual(target.titles.length, 4, 'Should have 4 parent titles in breadcrumb');
		assert.strictEqual(target.depth, 4, 'Should represent H4 depth');

		// ポジションチェック
		assert.strictEqual(target.position.line, 14, 'H4 heading should start on line 14');

		// 内容のチェック
		assert.ok(target.text.startsWith('#### 1.1.1.1'), 'Chunk should start with the expected heading');
		assert.ok(target.text.includes('merged with their parent heading'), 'Chunk should contain its content');
	});

	await t.test('Verify URL cleaning logic (Last Chunk)', () => {
		const last = chunks[chunks.length - 1];
		assert.ok(!last.text.includes('https://www1.example.com'), 'Long URL should be removed from the chunk text');
	});
});
