import fs from 'node:fs/promises';
import path from 'node:path';
import db from '#server/core/database';
import nooklog from '#server/core/nooklog';
import _ from '#server/core/util';

// Set your Obsidian clippings directory path here
const CLIPPINGS_DIR = 'C:/Path/To/Your/Vault/Clippings';

// Initialize core services
await db.initialize();
await nooklog.initialize();

// List all markdown files in the directory
const files = (await fs.readdir(CLIPPINGS_DIR))
	.filter(f => f.endsWith('.md'));

console.log(`\nFound ${files.length} clippings in ${CLIPPINGS_DIR}\n`);

// Process each file one by one
for (const filename of files) {
	const filePath = path.join(CLIPPINGS_DIR, filename);

	try {
		const content = await fs.readFile(filePath, 'utf-8');
		const { meta, body } = _.parseFrontmatter(content);

		const url = meta.source || meta.url;
		if (!url) {
			console.log(`[ SKIP ] No source URL found in frontmatter: ${filename}`);
			continue;
		}

		// Save to Nooklog with chronological mapping
		await nooklog.save({
			url,
			title: meta.title || filename.replace(/\.md$/, ''),
			markdown: body,
			tags: meta.tags,
			created_at: meta.published || meta.created, // Original content creation date
			updated_at: meta.created, // When the clipping was created
		});

		console.log(`[  OK  ] ${filename}`);
	} catch (e) {
		console.error(`[FAILED] ${filename} - ${e.message}`);
	}
}

console.log('\nImport complete! ✨');

// Graceful shutdown
await nooklog.dispose();
process.exit(0);
