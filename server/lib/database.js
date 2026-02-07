import lancedb from '@lancedb/lancedb';
const { MultiMatchQuery } = lancedb;
import path from 'path';
import { fileURLToPath } from 'url';
import { bench } from './util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', '..', 'data', 'lancedb');

const OPTIMIZE_THRESHOLD = 100;
const KEEP_VERSIONS_DAYS = 7;

class Database {
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
	// (Vector型はaddできない/v0.11)
	_populate(results) {
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
		return this._populate(results)[0];
	}

	async findById(id) {
		const results = await this.bookmarks.query()
			.where(sql`id = ${id}`).limit(1).toArray();
		return this._populate(results)[0];
	}

	async upsert(bookmark, content) {
		await bench(async () => {
			await this.bookmarks.delete(sql`id = ${bookmark.id}`);
			await this.bookmarks.add([bookmark]);

			if (content) {
				await this.contents.delete(sql`id = ${content.id}`);
				await this.contents.add([content]);
			}
		}, 'database.upsert');

		// 最適化(非同期実行)
		this.optimize();
	}

	async optimize() {
		// 断片化が進行していなければ最適化をスキップする
		const stats = await this.bookmarks.stats();
		const fragments = stats.fragmentStats.numSmallFragments;
		if (fragments < OPTIMIZE_THRESHOLD)
			return;

		for (const table of [this.bookmarks, this.contents]) {
			await bench(async () => {
				await table.optimize({
					cleanupOlderThan: new Date(
						Date.now() - KEEP_VERSIONS_DAYS * 24 * 60 * 60 * 1000),
				});
			}, `database.optimize: ${table.name}(fragments: ${fragments})`);
		}
	}

	async deleteById(id) {
		await this.bookmarks.delete(sql`id = ${id}`);
		await this.contents.delete(sql`id = ${id}`);
	}

	async getRecent(limit = 100) {
		const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		return this._populate(
			(await this.bookmarks.query()
				.select([
					'id', 'url', 'title', 'memo',
					'tags', 'rating',
					'updated_at', 'created_at'])
				.where(sql`updated_at > ${oneWeekAgo}`)
				.toArray())
				.sort((a, b) => b.updated_at - a.updated_at)
				.slice(0, limit));
	}

	async getDump(limit = 20) {
		// 読み込み専用オブジェクトをクローンする
		const bookmarks = (await this.getRecent(limit)).map(b => ({ ...b }));
		for (const b of bookmarks) {
			const [content] = await this.contents.query()
				.select(['markdown'])
				.where(sql`id = ${b.id}`).limit(1).toArray();
			if (content)
				b.markdown = content.markdown;
		}
		return bookmarks;
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

	async search({
		tags = [], query = '', fields = [], minRating, sortBy = 'updated_at', limit = 200 }) {

		let builder = this.bookmarks.query();

		const conditions = [];
		if (tags.length > 0)
			conditions.push(sql`array_has_all(tags, ${tags})`);

		if (minRating != null)
			conditions.push(sql`rating >= ${minRating}`);

		if (conditions.length > 0)
			builder = builder.where(conditions.join(' AND '));

		query = query.trim();
		if (query && fields.length > 0)
			builder = builder.fullTextSearch(new MultiMatchQuery(query, fields));

		// 誤ヒットも想定し多めに結果を取得する
		// (未指定の場合 結果件数は大幅に切り詰められる)
		let results = await builder.limit(limit * 5).toArray();
		if (query) {
			// クエリワードやフレーズが含まれているもののみを抽出する
			// (FTSで高速に広く取得し RegExpで絞り込む)
			const patterns = (query.match(/".+?"|[^\s"]+/g) || [])
				.map(w => w.replace(/^"|"$/g, '')) // クォートを外す
				.map(w => new RegExp(
					w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
			results = results.filter(r =>
				patterns.every(p =>
					fields.some(f => p.test(r[f]))));
		}

		return this._populate(
			results
				.sort((a, b) => b[sortBy] - a[sortBy])
				.slice(0, limit));
	}
}

function sql(strings, ...values) {
	return values.reduce(
		(acc, val, i) => acc + sqlValue(val) + strings[i + 1], strings[0]);
}

function sqlValue(val) {
	if (val === undefined || val === null)
		return 'NULL';

	if (typeof val === 'string')
		return `'${val.replace(/'/g, '\'\'')}'`;

	if (Array.isArray(val))
		return `[${val.map(sqlValue).join(', ')}]`;

	return val;
}

export default new Database();
