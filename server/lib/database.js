import path from 'path';
import lancedb from '@lancedb/lancedb';
const { MultiMatchQuery } = lancedb;

import _ from './util.js';
import config from './config.js';

class Database {
	constructor() {
		this.db = null;
		this.bookmarks = null;
	}

	async initialize() {
		this.db = await lancedb.connect(path.join(config['server.data.path'], 'db'));
		this.bookmarks = await this.db.openTable('bookmarks');
		console.log(`bookmarks: ${await this.bookmarks.countRows()} rows.`);
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

	async _find(where, { columns } = {}) {
		let builder = this.bookmarks.query();
		if (columns)
			builder = builder.select(columns);
		const results = await builder
			.where(where).limit(1).toArray();
		return this._populate(results)[0];
	}

	async findByUrl(url, options) {
		return this._find(sql`url = ${url}`, options);
	}

	async findById(id, options) {
		return this._find(sql`id = ${id}`, options);
	}

	async upsert(bookmark) {
		await this.bookmarks.mergeInsert('id')
			.whenMatchedUpdateAll()
			.whenNotMatchedInsertAll()
			.execute([bookmark]);

		this.optimize();
	}

	async deleteById(id) {
		await this.bookmarks.delete(sql`id = ${id}`);
	}

	async getRecent({ columns, limit = 100, sortBy = 'updated_at' } = {}) {
		const recentThreshold = Date.now() - config['database.recentThresholdDays'] * 24 * 60 * 60 * 1000;
		let builder = this.bookmarks.query();
		if (columns)
			builder = builder.select(columns);
		return this._populate(
			(await builder
				.where(`${sortBy === 'rating' ? 'created_at' : sortBy} > ${recentThreshold}`)
				.toArray())
				.sort((a, b) => b[sortBy] - a[sortBy])
				.slice(0, limit));
	}

	async getTags() {
		const results = await this.bookmarks.query().select(['tags']).toArray();
		const tags = new Set();
		for (const row of results) {
			for (const tag of row.tags.toArray())
				tags.add(tag);
		}
		return Array.from(tags).sort();
	}

	async existsTag(tag) {
		const results = await this.bookmarks.query()
			.select(['tags'])
			.where(sql`array_has_any(tags, ${[tag]})`)
			.limit(1).toArray();
		return results.length >= 1;
	}

	async search({
		columns, tags = [], query = '', fields = [],
		rating, sortBy = 'updated_at', limit = 200,
	}) {

		const { conditions, ftsQuery, patterns } = this.buildSearchQuery({
			tags, query, fields, rating,
		});

		let builder = this.bookmarks.query();
		if (columns) {
			const cols = [...columns];
			for (const f of fields) {
				if (!cols.includes(f))
					cols.push(f);
			}
			builder = builder.select(cols);
		}

		if (conditions)
			builder = builder.where(conditions);

		if (ftsQuery)
			builder = builder.fullTextSearch(ftsQuery);

		// 誤ヒットも想定し多めに結果を取得する
		// (未指定の場合 結果件数は大幅に切り詰められる)
		let results = await builder.limit(limit * 5).toArray();
		if (patterns) {
			// クエリワードやフレーズが含まれているもののみを抽出する
			// (FTSで高速に広く取得し RegExpで絞り込む)
			results = results.filter(r =>
				patterns.every(p =>
					fields.some(f => p.test(r[f]))));
		}

		return this._populate(
			results
				.sort((a, b) => b[sortBy] - a[sortBy])
				.slice(0, limit));
	}

	buildSearchQuery({ tags = [], query = '', fields = [], rating }) {
		const conditions = [];
		if (tags.length > 0)
			conditions.push(sql`array_has_all(tags, ${tags})`);

		if (rating != null)
			conditions.push(sql`rating >= ${rating}`);

		query = query.trim();

		let ftsQuery = null;
		let patterns = null;
		if (query && fields.length > 0) {
			const tokens = (query.match(/".+?"|[^\s"]+/g) || [])
				.map(w => w.replace(/^"|"$/g, ''));

			const shortTokens = tokens.filter(t => [...t].length < 2);
			const longTokens = tokens.filter(t => [...t].length >= 2);

			if (shortTokens.length > 0) {
				const likeOr = shortTokens.map(t =>
					fields.map(f => `${f} LIKE ${sql`${'%' + t + '%'}`}`).join(' OR '),
				).map(c => `(${c})`).join(' AND ');
				conditions.push(`(${likeOr})`);
			}

			if (longTokens.length > 0)
				ftsQuery = new MultiMatchQuery(longTokens.join(' '), fields);

			patterns = tokens.map(w => new RegExp(
				w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
		}

		return {
			conditions: conditions.length > 0 ? conditions.join(' AND ') : null,
			ftsQuery,
			patterns,
		};
	}

	async optimize() {
		// 断片化した小ファイルが閾値を超えたら最適化する
		const stats = await this.bookmarks.stats();
		const fragments = stats.fragmentStats.numSmallFragments;
		if (fragments < config['database.optimization.maxSmallFragments'])
			return;

		await _.bench(async () => {
			await this.bookmarks.optimize({
				cleanupOlderThan: new Date(
					Date.now() - config['database.optimization.versionRetentionDays'] * 24 * 60 * 60 * 1000),
			});
		}, `database.optimize: bookmarks(fragments: ${fragments})`);
	}
}

// カラム名が文字列変数の場合 クォートされるので注意すること
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
