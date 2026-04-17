import db from '#server/core/database';
import nooklog from '#server/core/nooklog';
import { env } from '#server/core/config';
import store from '#server/core/store';
import { batch } from '#server/core/queue';
import * as browser from '#server/core/ingest/browser';

// env['server.data.path'] = './custom-data'; // Override data path if needed

await db.initialize();
await nooklog.initialize();

// Fetch bookmarks with missing content (Skip if already failed)
const bookmarks = await store.query(`
	SELECT id, url, title, updated_at FROM bookmark
	WHERE (markdown IS NULL OR markdown = '')
	AND json_extract(meta, '$._fetch_error') IS NULL
	ORDER BY created_at DESC
	LIMIT 500
`);
console.log(`\nStarting backfill for ${bookmarks.length} bookmarks...\n`);

// Use the standard queue.batch for cooperative processing
await batch(bookmarks, async slice => {
	const b = slice[0];
	console.log(`Fetching: ${b.url}`);
	try {
		// Fetch web content
		const { html, title } = await browser.fetch(b.url);

		await nooklog.save({
			id: b.id,
			url: b.url,
			title: b.title || title,
			html,
			updated_at: b.updated_at,
			meta: { _fetch_error: null },
		});

		console.log(`[  OK  ] ${b.title || title}`);
	} catch (e) {
		console.error(`[FAILED] ${b.url} - ${e.message}`);

		// Record failure reason
		await nooklog.save({
			id: b.id,
			updated_at: b.updated_at,
			meta: { _fetch_error: e.status || e.message },
		});
	}
}, {
	// Use a polite interval between requests
	size: 1, interval: 2 * 1000, label: 'Backfilling missing content',
});

console.log('\nAll done! ✨');

await nooklog.dispose();
process.exit(0);
