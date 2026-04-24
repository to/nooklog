import db from '#server/core/database';
import nooklog from '#server/core/nooklog';
import store from '#server/core/store';
import { batch } from '#server/core/queue';

await db.initialize();
await nooklog.initialize();

// Fetch all bookmarks from video platforms
const bookmarks = await store.query(`
	SELECT * FROM bookmark
	WHERE (
		url LIKE '%youtube.com/%'
		OR url LIKE '%youtu.be/%'
		OR url LIKE '%vimeo.com/%'
		OR url LIKE '%nicovideo.jp/%'
		OR url LIKE '%bilibili.com/%'
		OR url LIKE '%tiktok.com/%'
		OR url LIKE '%dailymotion.com/%'
	)`);

console.log(`\nChecking ${bookmarks.length} video bookmarks for tagging...\n`);

// Batch process to add the 'video' tag
await batch(bookmarks, async slice => {
	const targets = [];
	for (const b of slice) {
		try {
			if (b.tags.includes('video'))
				continue;

			b.tags.push('video');
			targets.push(b);

			console.log(`[  OK  ] Tagged as video: ${b.url}`);
		} catch (e) {
			console.error(`[FAILED] ${b.url}: ${e.message}`);
		}
	}

	// Bulk save without re-embedding to keep it fast
	await store.save(targets, { embed: false });
}, { size: 50, label: 'Tagging Videos' });

console.log('\nTagging completed! 🎬✨');

await nooklog.dispose();
process.exit(0);
