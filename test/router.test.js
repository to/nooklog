import { test } from 'node:test';
import assert from 'node:assert';
import { call } from '@orpc/server';
import { env } from '../server/core/config.js';

test('router integration verification', async t => {
	// Set database to in-memory mode
	env['database.turso.url'] = ':memory:';
	env['database.turso.token'] = 'dummy';

	// Import router and core
	const { router } = await import('../server/router.js');
	const { default: nooklog } = await import('../server/core/nooklog.js');
	await nooklog.initialize();

	await t.test('Scenario: save -> find by url -> update by id -> find by id', async () => {
		for (let i = 1; i <= 5; i++) {
			const url = `https://example.com/item-${i}`;
			const initialTitle = `Title ${i}`;
			const updatedTitle = `Updated Title ${i}`;
			const rating = (i % 5) + 1;

			// 1. Initial save
			const initialSummary = `Summary ${i}`;
			const saved = await call(router.save, {
				url,
				title: initialTitle,
				summary: initialSummary,
				markdown: 'Hello!',
				tags: ['test'],
				rating: 0,
			});
			assert.strictEqual(saved.title, initialTitle);
			assert.strictEqual(saved.summary, initialSummary);
			const id = saved.id;

			// 2. Update title and find by URL
			await call(router.save, { url, title: updatedTitle });
			const foundByUrl = await call(router.find, { url });
			assert.strictEqual(foundByUrl.title, updatedTitle, `Item ${i} should be updated by URL`);

			// 3. Update rating by ID and find by ID
			await call(router.save, { id, rating });
			const foundById = await call(router.find, { id });
			assert.strictEqual(foundById.rating, rating, `Item ${i} should have correct rating`);
			assert.strictEqual(foundById.title, updatedTitle, `Item ${i} should preserve title`);

			// 4. Delete item by ID
			await call(router.delete, { id });

			// 5. Verify it's gone
			const gone = await call(router.find, { id });
			assert.strictEqual(gone, undefined, `Item ${i} should be deleted`);
		}
	});
});
