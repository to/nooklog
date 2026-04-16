import db from '../server/core/database.js';
import nooklog from '../server/core/nooklog.js';
import { env } from '../server/core/config.js';
import { batch } from '../server/core/queue.js';
import * as browser from '../server/core/ingest/browser.js';

// env['server.data.path'] = './custom-data'; // Override data path if needed

await db.initialize();
await nooklog.initialize();

// Fetch bookmarks with missing content (Skip if already failed)
const rs = await db.client.execute(`
	SELECT id, url, title FROM bookmark
	WHERE (markdown IS NULL OR markdown = '')
	AND json_extract(meta, '$._fetch_error') IS NULL
	ORDER BY created_at DESC
	LIMIT 100
`);

const bookmarks = rs.rows;
console.log(`\nStarting backfill for ${bookmarks.length} bookmarks...\n`);

// Use the standard queue.batch for cooperative processing
await batch(bookmarks, async slice => {
	const b = slice[0];
	console.log(`Fetching: ${b.url}`);
	try {
		const { html, title } = await browser.fetch(b.url);

		await nooklog.save({
			id: b.id,
			url: b.url,
			title: title || b.title, // Prioritize newly fetched title
			html,
			meta: { _fetch_error: null },
		});

		console.log(`   OK: ${title || b.title}`);
	} catch (e) {
		console.error(`   FAILED: ${b.url} - ${e.message}`);

		await nooklog.save({
			id: b.id,
			meta: { _fetch_error: e.status || e.message },
		});
	}
}, { size: 1, interval: 2 * 1000, label: 'Backfilling missing content' });

console.log('\nAll done! ✨');

await nooklog.dispose();
process.exit(0);
