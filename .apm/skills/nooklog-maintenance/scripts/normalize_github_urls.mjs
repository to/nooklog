import db from '#server/core/database';
import nooklog from '#server/core/nooklog';
import store from '#server/core/store';
import { batch } from '#server/core/queue';

await db.initialize();
await nooklog.initialize();

// Fetch all bookmarks with cluttering query parameters
const bookmarks = await store.query(`
	SELECT * FROM bookmark
	WHERE (url LIKE '%?tab=%' OR url LIKE '%&tab=%')
`);
console.log(`\nFound ${bookmarks.length} URLs needing normalization...\n`);

// Use bulk batch size to leverage store.save's array support
await batch('Normalizing URLs', async slice => {
	const targets = [];
	for (const b of slice) {
		try {
			const oldUrl = b.url;

			// Cleanup query parameters
			const url = new URL(b.url);
			url.searchParams.delete('tab');

			const newUrl = url.toString();
			if (oldUrl !== newUrl) {
				b.url = newUrl;
				targets.push(b);

				console.log(`[  OK  ] ${oldUrl} -> ${newUrl}`);
			}
		} catch (e) {
			console.error(`[FAILED] ${b.url}: ${e.message}`);
		}
	}

	// Bulk save for efficiency. No re-embedding needed for URL-only changes.
	await store.save(targets, { embed: false });
}, bookmarks, { size: 50 });

console.log('\nNormalization completed! ✨');

await nooklog.dispose();
process.exit(0);
