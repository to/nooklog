import lancedb from '@lancedb/lancedb';
import { sql } from './util.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'data', 'lancedb');

class NookmarkDatabase {
	constructor() {
		this.db = null;
		this.bookmarks = null;
		this.contents = null;
	}

	async initialize() {
		this.db = await lancedb.connect(DB_DIR);
		this.bookmarks = await this.db.openTable('bookmarks');
		this.contents = await this.db.openTable('contents');

		console.log('LanceDB initialized.');
		console.log(`bookmarks: ${await this.bookmarks.countRows()} rows.`);
		console.log(`contents: ${await this.contents.countRows()} rows.`);
	}

	// LanceDBのVector型をJSの標準配列に変換する
	_sanitize(results) {
		if (results.length === 0)
			return results;

		const arrayColumns = Object.keys(results[0])
			.filter(key => results[0][key]?.toArray);

		for (const row of results) {
			for (const col of arrayColumns)
				row[col] = row[col].toArray();
		}
		return results;
	}

	async findByUrl(url) {
		const results = await this.bookmarks.query()
			.where(sql`url = ${url}`).limit(1).toArray();
		return this._sanitize(results)[0];
	}

	async findById(id) {
		const results = await this.bookmarks.query()
			.where(sql`id = ${id}`).limit(1).toArray();
		return this._sanitize(results)[0];
	}

	async save(bookmark, content) {
		await this.bookmarks.add([bookmark]);
		if (content)
			await this.contents.add([content]);
	}

	async upsert(bookmark, content) {
		await this.bookmarks.delete(sql`id = ${bookmark.id}`);
		await this.bookmarks.add([bookmark]);

		if (content) {
			await this.contents.delete(sql`id = ${content.id}`);
			await this.contents.add([content]);
		}
	}

	async deleteById(id) {
		await this.bookmarks.delete(sql`id = ${id}`);
		await this.contents.delete(sql`id = ${id}`);
	}

	async getRecent(limit = 20) {
		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

		const bookmarks = (await this.bookmarks.query()
			.where(sql`updated_at > ${oneWeekAgo}`)
			.toArray())
			.sort((a, b) => b.updated_at - a.updated_at)
			.slice(0, limit)
			.map(b => ({ ...b }));

		for (const b of bookmarks) {
			const [content] = await this.contents.query()
				.where(sql`id = ${b.id}`).limit(1).toArray();
			Object.assign(b, content);
		}
		return this._sanitize(bookmarks);
	}

	async getAllTags() {
		const results = await this.bookmarks.query().toArray();
		const tags = new Set();
		for (const row of results) {
			for (const tag of row.tags.toArray())
				tags.add(tag);
		}
		return Array.from(tags).sort();
	}
}

const db = new NookmarkDatabase();
export default db;
