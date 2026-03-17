import db, { normalizeJp } from './database.js';
import config from './config.js';
import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'store' });

const store = {
	UNLIMITED: 100 * 10000,

	findByUrl(url, { columns = ['*'] } = {}) {
		const row = db.prepare(`SELECT ${columns.join(', ')} FROM bookmark WHERE url = ?`).get(url);
		return this._parse(row);
	},

	findById(id, { columns = ['*'] } = {}) {
		const row = db.prepare(`SELECT ${columns.join(', ')} FROM bookmark WHERE id = ?`).get(id);
		return this._parse(row);
	},

	save(input) {
		const bookmarks = Array.isArray(input) ? input : [input];
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO bookmark (
				id, url, title, memo, rating, tags, created_at, updated_at, html, markdown, summary
			) VALUES (
				@id, @url, @title, @memo, @rating, @tags, @created_at, @updated_at, @html, @markdown, @summary
			)
		`);

		db.transaction(() => {
			for (const b of bookmarks) {
				const data = {
					...db.createBookmark(),
					...b,
					tags: JSON.stringify(b.tags || []),
				};
				stmt.run(data);
			}
		});
	},

	import(bookmarks) {
		const existingUrls = new Set(
			db.prepare('SELECT url FROM bookmark').all().map(r => r.url),
		);

		const newBookmarks = bookmarks
			.filter(b => !existingUrls.has(b.url))
			.map(b => Object.assign(db.createBookmark(), b));

		if (newBookmarks.length > 0)
			this.save(newBookmarks);

		return newBookmarks.length;
	},

	deleteById(id) {
		db.prepare('DELETE FROM bookmark WHERE id = ?').run(id);
	},

	getRecent({ columns = ['*'], limit = 100, sortBy = 'updated_at' } = {}) {
		const rows = db.prepare(`
			SELECT ${columns.join(', ')} FROM bookmark
			ORDER BY ${sortBy} DESC, updated_at DESC
			LIMIT ?
		`).all(limit);

		const totalCount = db.getTotalCount();
		return {
			totalCount,
			count: totalCount,
			bookmarks: rows.map(r => this._parse(r)),
		};
	},

	getTags() {
		const rows = db.prepare(`
			SELECT DISTINCT value as tag FROM bookmark, json_each(tags)
			ORDER BY tag
		`).all();
		return rows.map(r => r.tag);
	},

	existsTag(tag) {
		const row = db.prepare(`
			SELECT 1 FROM bookmark, json_each(tags)
			WHERE value = ? LIMIT 1
		`).get(tag);
		return !!row;
	},

	search({
		columns = ['*'], tags = [], query = '', fields = [], rating, sortBy = 'updated_at', limit = 300,
	}) {
		const { conditions, params, ftsSql } = this._buildSearchQuery({
			tags, query, fields, rating,
		});
		const select = (ftsSql ? columns.map(c => `b.${c}`) : columns).join(', ');

		let searchParams = [];
		let sql = ftsSql
			? `SELECT ${select} FROM bookmark b
				 WHERE b.rowid IN (SELECT rowid FROM bookmark_fts WHERE bookmark_fts MATCH ?)`
			: `SELECT ${select} FROM bookmark`;

		if (ftsSql)
			searchParams.push(ftsSql);

		if (conditions.length > 0)
			sql += (ftsSql ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
		searchParams.push(...params);

		const orderBy = sortBy === 'updated_at'
			? 'updated_at DESC'
			: `${sortBy} DESC, updated_at DESC`;
		sql += ` ORDER BY ${orderBy} LIMIT ?`;
		searchParams.push(limit);

		logger.debug({ sql, searchParams }, 'executing search query');

		const rows = db.prepare(sql).all(...searchParams);
		const totalCount = db.getTotalCount();
		return {
			count: rows.length,
			totalCount,
			bookmarks: rows.map(r => this._parse(r)),
		};
	},

	_buildSearchQuery({ tags = [], query = '', fields = [], rating }) {
		const conditions = [];
		const params = [];

		if (tags.length > 0) {
			for (const tag of tags) {
				conditions.push('EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)');
				params.push(tag);
			}
		}

		if (rating != null) {
			conditions.push('rating >= ?');
			params.push(rating);
		}

		let ftsSql = null;
		if (query?.trim()) {
			// フレーズ（"..."）を考慮してトークン分割
			const tokens = (query.match(/".+?"|[^\s"]+/g) || [])
				.map(w => w.replace(/^"|"$/g, ''));

			// FTS5のカラム指定形式を生成（指定があれば { col1 col2 } : の形式）
			const columnSpec = fields.length > 0 ? `{ ${fields.join(' ')} } : ` : '';
			const ftsTokens = tokens.map(token => {
				// 案1: 1文字 Uni-gram をフレーズとして結合し、隣接マッチを実現（NEAR 0 相当）
				// 例: 「ベース」 → ""ベ" "ー" "ス""
				const phrase = [...normalizeJp(token)].map(c => c.replace(/"/g, '""')).join(' ');
				return `${columnSpec}"${phrase}"`;
			});

			// 複数の検索語はすべて AND で結合する
			ftsSql = ftsTokens.join(' AND ');
		}

		return { conditions, params, ftsSql };
	},

	_parse(row) {
		if (row)
			row.tags = JSON.parse(row.tags || '[]');
		return row;
	},
};

export default store;
