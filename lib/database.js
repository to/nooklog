import lancedb from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';
import { sql } from './util.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'data', 'lancedb');
const BOOKMARKS_TABLE = 'bookmarks';
const CONTENTS_TABLE = 'contents';

const BookmarksSchema = new arrow.Schema([
	new arrow.Field('id', new arrow.Utf8()),
	new arrow.Field('url', new arrow.Utf8()),
	new arrow.Field('title', new arrow.Utf8()),
	new arrow.Field('memo', new arrow.Utf8()),
	new arrow.Field('rating', new arrow.Int32()),
	new arrow.Field('keywords', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
	new arrow.Field('keywords_full', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
	new arrow.Field('tags', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
	new arrow.Field('created_at', new arrow.TimestampMillisecond()),
	new arrow.Field('updated_at', new arrow.TimestampMillisecond()),
]);

const ContentsSchema = new arrow.Schema([
	new arrow.Field('id', new arrow.Utf8()),
	new arrow.Field('html', new arrow.Utf8()),
	new arrow.Field('markdown', new arrow.Utf8()),
]);

class NookmarkDatabase {
	constructor() {
		this.db = null;
		this.bookmarks = null;
		this.contents = null;
	}

	async initialize() {
		if (!fs.existsSync(DB_DIR))
			fs.mkdirSync(DB_DIR, { recursive: true });

		this.db = await lancedb.connect(DB_DIR);

		const tableNames = await this.db.tableNames();

		if (!tableNames.includes(BOOKMARKS_TABLE)) {
			console.log(`Creating table: ${BOOKMARKS_TABLE}`);
			this.bookmarks = await this.db.createEmptyTable(BOOKMARKS_TABLE, BookmarksSchema);
		} else {
			this.bookmarks = await this.db.openTable(BOOKMARKS_TABLE);
		}

		if (!tableNames.includes(CONTENTS_TABLE)) {
			console.log(`Creating table: ${CONTENTS_TABLE}`);
			this.contents = await this.db.createEmptyTable(CONTENTS_TABLE, ContentsSchema);
		} else {
			this.contents = await this.db.openTable(CONTENTS_TABLE);
		}

		console.log('LanceDB initialized.');
		console.log(`Table "${BOOKMARKS_TABLE}" has ${await this.bookmarks.countRows()} rows.`);
		console.log(`Table "${CONTENTS_TABLE}" has ${await this.contents.countRows()} rows.`);
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
		console.log('getRecent: ', limit);

		const bookmarks = (await this.bookmarks.query().toArray())
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
