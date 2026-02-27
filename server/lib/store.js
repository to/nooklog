import lancedb from '@lancedb/lancedb';
const { MultiMatchQuery, BooleanQuery, MatchQuery, Occur } = lancedb;

import config from './config.js';
import baseLogger from './logger.js';
import db, { sql, populate } from './database.js';

const logger = baseLogger.child({ module: 'store' });

const store = {
	async _find(where, { columns } = {}) {
		let builder = db.bookmarks.query();
		if (columns)
			builder = builder.select(columns);
		const results = await builder
			.where(where).limit(1).toArray();
		return populate(results)[0];
	},

	async findByUrl(url, options) {
		return this._find(sql`url = ${url}`, options);
	},

	async findById(id, options) {
		return this._find(sql`id = ${id}`, options);
	},

	async upsert(bookmark) {
		await db.bookmarks.mergeInsert('id')
			.whenMatchedUpdateAll()
			.whenNotMatchedInsertAll()
			.execute([bookmark]);

		db.optimize();
	},

	async deleteById(id) {
		await db.bookmarks.delete(sql`id = ${id}`);
	},

	async getRecent({ columns, limit = 100, sortBy = 'updated_at' } = {}) {
		const recentThreshold = Date.now() - config['database.recentThresholdDays'] * 24 * 60 * 60 * 1000;
		let builder = db.bookmarks.query();
		if (columns)
			builder = builder.select(columns);
		return populate(
			(await builder
				.where(`${sortBy === 'rating' ? 'created_at' : sortBy} > ${recentThreshold}`)
				.toArray())
				.sort((a, b) => b[sortBy] - a[sortBy])
				.slice(0, limit));
	},

	async getTags() {
		const results = await db.bookmarks.query().select(['tags']).toArray();
		const tags = new Set();
		for (const row of results) {
			for (const tag of row.tags.toArray())
				tags.add(tag);
		}
		return Array.from(tags).sort();
	},

	async existsTag(tag) {
		const results = await db.bookmarks.query()
			.select(['tags'])
			.where(sql`array_has_any(tags, ${[tag]})`)
			.limit(1).toArray();
		return results.length >= 1;
	},

	async search({
		columns, tags = [], query = '', fields = [],
		rating, sortBy = 'updated_at', limit = 200,
	}) {

		const { conditions, ftsQuery, patterns } = this._buildSearchQuery({
			tags, query, fields, rating,
		});

		let builder = db.bookmarks.query();
		if (columns) {
			const selection = new Set([...columns, ...fields]);
			if (ftsQuery)
				selection.add('_score');
			builder = builder.select([...selection]);
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

		return populate(
			results
				.sort((a, b) => b[sortBy] - a[sortBy])
				.slice(0, limit));
	},

	_buildSearchQuery({ tags = [], query = '', fields = [], rating }) {
		const conditions = [];
		if (tags.length > 0)
			conditions.push(sql`array_has_all(tags, ${tags})`);

		if (rating != null)
			conditions.push(sql`rating >= ${rating}`);

		query = query.trim();

		let ftsQuery = null;
		let patterns = null;
		if (query && fields.length > 0) {
			// フレーズ検索も考慮して検索語を分割する
			const tokens = (query.match(/".+?"|[^\s"]+/g) || [])
				.map(w => w.replace(/^"|"$/g, ''));

			const shortTokens = tokens.filter(t => [...t].length < 2);
			const longTokens = tokens.filter(t => [...t].length >= 2);

			// 1文字の短い検索語があるか？(例:猫)
			if (shortTokens.length > 0) {
				const likeOr = shortTokens.map(t =>
					fields.map(f => `${f} LIKE ${sql`${'%' + t + '%'}`}`).join(' OR '),
				).map(c => `(${c})`).join(' AND ');
				conditions.push(`(${likeOr})`);
			}

			if (longTokens.length > 0) {
				ftsQuery = new BooleanQuery(
					// NOTE: fuzziness was avoided because it could cause exact matches to fail.
					longTokens.map(token => {
						return [Occur.Must, new BooleanQuery(
							fields.map(field => [Occur.Should, new MatchQuery(token, field)]),
						)];
					}),
				);
			}

			patterns = tokens.map(w => new RegExp(
				w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
		}

		return {
			conditions: conditions.length > 0 ? conditions.join(' AND ') : null,
			ftsQuery,
			patterns,
		};
	},
};

export default store;
