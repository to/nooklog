import { test } from 'node:test';
import assert from 'node:assert';
import config, { env } from '../server/core/config.js';

test('SQLite FTS Uni-gram Search Verification', async t => {
	// Set database to in-memory and use unigram tokenizer
	env['database.turso.url'] = ':memory:';
	env['database.turso.token'] = 'dummy';
	env['database.tokenizer'] = 'unigram';

	const { default: db } = await import('../server/core/database.js');
	const { default: store } = await import('../server/core/store.js');
	const { default: queue } = await import('../server/core/queue.js');

	const testData = [
		{ id: '1', url: 'https://google.com', title: 'Google検索', memo: '便利な検索エンジン', tags: ['IT', 'Search'], rating: 5 },
		{ id: '2', url: 'https://github.com', title: 'GitHub', memo: 'コード管理システム', tags: ['IT', 'Dev'], rating: 4 },
		{ id: '3', url: 'https://wikipedia.org/wiki/SQLite', title: 'SQLite', memo: '軽量なデータベース', tags: ['DB'], rating: 5 },
	];

	await t.test('Save and Search operations', async () => {
		await store.save(testData);
		await queue.idle();

		// Verification for Uni-gram Search performance on Japanese text
		const r1 = await store.search({ query: '検索' });
		assert.strictEqual(r1.bookmarks.length, 1);
		assert.strictEqual(r1.bookmarks[0].title, 'Google検索');

		const r2 = await store.search({ query: 'コード' });
		assert.strictEqual(r2.bookmarks.length, 1);
		assert.strictEqual(r2.bookmarks[0].memo, 'コード管理システム');

		// Verification for Tag Search
		const r3 = await store.search({ tags: ['IT'] });
		assert.strictEqual(r3.bookmarks.length, 2);

		const r4 = await store.search({ tags: ['IT', 'Dev'] });
		assert.strictEqual(r4.bookmarks.length, 1);
		assert.strictEqual(r4.bookmarks[0].id, '2');

		// Verification for Rating Filter
		const r5 = await store.search({ rating: 5 });
		assert.strictEqual(r5.bookmarks.length, 2);
	});
});
