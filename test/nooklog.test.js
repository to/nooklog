import { test, mock } from 'node:test';
import assert from 'node:assert';

// USER_MARK の定義
const USER_MARK = '\u200B';

mock.module('../server/lib/database.js', {
	defaultExport: {
		createBookmark: () => ({
			id: 'new-id',
			url: '',
			title: '',
			memo: '',
			tags: [],
			created_at: Date.now(),
			updated_at: Date.now(),
		}),
	},
	namedExports: {
		sql: () => '',
		populate: r => r,
	},
});

mock.module('../server/lib/store.js', {
	defaultExport: {
		findById: id => ({
			id: 'test-id',
			url: 'https://example.com',
			title: 'Old Title',
			markdown: 'User edited content' + USER_MARK,
			tags: [],
		}),
		findByUrl: () => null,
		getTags: () => [],
		save: async b => { },
		existsTag: async () => true,
	},
});

test('nooklog.js - upsert logic with USER_MARK', async t => {
	const { default: nooklog } = await import('../server/lib/nooklog.js');

	await t.test('ユーザー編集済みの Markdown は、編集されていない入力では上書きされないこと', async () => {
		const input = {
			id: 'test-id',
			url: 'https://example.com',
			markdown: 'Fresh automatic content', // USER_MARK なし
		};

		const result = await nooklog.upsert(input);
		assert.strictEqual(
			result.markdown,
			'User edited content' + USER_MARK,
			'既存の編集済みマークダウンが維持されるべき',
		);
	});

	await t.test('ユーザー編集済みの Markdown でも、新しい編集入力なら上書きされること', async () => {
		const input = {
			id: 'test-id',
			url: 'https://example.com',
			markdown: 'New manual edit' + USER_MARK, // USER_MARK あり
		};

		const result = await nooklog.upsert(input);
		assert.strictEqual(
			result.markdown,
			'New manual edit' + USER_MARK,
			'新しい編集データで上書きされるべき',
		);
	});
});
