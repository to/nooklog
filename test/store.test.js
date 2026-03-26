import { test } from 'node:test';
import assert from 'node:assert';
import config from '../server/lib/config.js';

test('SQLite FTS Uni-gram Search Verification', async t => {
	// テスト用にメモリDBを使用するように設定を上書き
	config['server.data.path'] = ':memory:';

	// 設定上書き後に動的インポートすることで、initialize() に反映させる
	const { default: db } = await import('../server/lib/database.js');
	const { default: store } = await import('../server/lib/store.js');

	// 初期化待機
	// (nooklog.js 以外のテストでは手動で呼ぶ必要がある)
	await db.initialize();

	// クリーンアップ
	await db.client.execute('DELETE FROM bookmark');
	await db.client.execute('DELETE FROM bookmark_fts');

	const testData = [
		{
			id: '1',
			url: 'https://google.com',
			title: 'Google検索',
			memo: '便利な検索エンジン',
			tags: ['IT', 'Search'],
			rating: 5,
			updated_at: Date.now(),
			created_at: Date.now(),
		},
		{
			id: '2',
			url: 'https://github.com',
			title: 'GitHub: Let\'s build from here',
			memo: 'コード管理システム',
			tags: ['IT', 'Dev'],
			rating: 4,
			updated_at: Date.now() - 1000,
			created_at: Date.now() - 1000,
		},
		{
			id: '3',
			url: 'https://wikipedia.org/wiki/SQLite',
			title: 'SQLite - Wikipedia',
			memo: '軽量なデータベース',
			tags: ['DB', 'Architecture'],
			rating: 5,
			updated_at: Date.now() - 2000,
			created_at: Date.now() - 2000,
		},
	];

	await t.test('Save data', async () => {
		await store.save(testData);
		const count = await db.getTotalCount();
		const rsFts = await db.client.execute('SELECT count(*) as count FROM bookmark_fts');
		const ftsCount = rsFts.rows[0].count;
		assert.strictEqual(count, 3);
		assert.strictEqual(ftsCount, 3);
	});

	await t.test('Uni-gram Search: "検索" (Search)', async () => {
		const result = await store.search({ query: '検索' });
		assert.strictEqual(result.bookmarks.length, 1);
		assert.strictEqual(result.bookmarks[0].title, 'Google検索');
	});

	await t.test('Uni-gram Search: "コード" (Code)', async () => {
		const result = await store.search({ query: 'コード' });
		assert.strictEqual(result.bookmarks.length, 1);
		assert.strictEqual(result.bookmarks[0].memo, 'コード管理システム');
	});

	await t.test('Uni-gram Search: "GitHub" (English)', async () => {
		const result = await store.search({ query: 'GitHub' });
		assert.strictEqual(result.bookmarks.length, 1);
		assert.strictEqual(result.bookmarks[0].title, 'GitHub: Let\'s build from here');
	});

	await t.test('Tag Search: "IT"', async () => {
		const result = await store.search({ tags: ['IT'] });
		assert.strictEqual(result.bookmarks.length, 2);
	});

	await t.test('Tag Search AND: "IT" AND "Dev"', async () => {
		const result = await store.search({ tags: ['IT', 'Dev'] });
		assert.strictEqual(result.bookmarks.length, 1);
		assert.strictEqual(result.bookmarks[0].id, '2');
	});

	await t.test('URL Search: "wiki"', async () => {
		const result = await store.search({ query: 'wiki' });
		assert.ok(result.bookmarks.length >= 1);
		assert.ok(result.bookmarks.some(b => b.url.includes('wiki')));
	});

	await t.test('Rating Filter: >= 5', async () => {
		const result = await store.search({ rating: 5 });
		assert.strictEqual(result.bookmarks.length, 2);
	});
});
