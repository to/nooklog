import { segment, segmentUrl, segmentMarkdown, normalizeJp } from './database.js';
import db from './database.js';
import config from './config.js';
import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'store' });

const store = {
	UNLIMITED: 100 * 10000,

	async findByUrl(url, { columns = ['*'] } = {}) {
		const rs = await db.client.execute({
			sql: `SELECT ${columns.join(', ')} FROM bookmark WHERE url = ?`,
			args: [url],
		});
		return this._parse(rs.rows[0]);
	},

	async findById(id, { columns = ['*'] } = {}) {
		const rs = await db.client.execute({
			sql: `SELECT ${columns.join(', ')} FROM bookmark WHERE id = ?`,
			args: [id],
		});
		return this._parse(rs.rows[0]);
	},

	async save(input) {
		const bookmarks = Array.isArray(input) ? input : [input];

		// libSQLではバッチ(Transaction相当)を使用
		const batch = [];

		for (const b of bookmarks) {
			const data = {
				...db.createBookmark(),
				...b,
			};

			// IDに基づき重複判定が必要なため、一度FTSから削除を試みる
			// (トリガーがないため手動管理。rowidの整合性を保つためのパターン)
			batch.push({
				sql: 'DELETE FROM bookmark_fts WHERE rowid = (SELECT rowid FROM bookmark WHERE id = ?)',
				args: [data.id],
			});

			batch.push({
				sql: `
					INSERT OR REPLACE INTO bookmark (
						id, url, title, memo, rating, tags, created_at, updated_at, html, markdown, summary
					) VALUES (
						?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					)
				`,
				args: [
					data.id, data.url, data.title, data.memo, data.rating,
					JSON.stringify(data.tags || []),
					data.created_at, data.updated_at, data.html, data.markdown, data.summary,
				],
			});

			// 最後にFTSに追加
			batch.push({
				sql: `
					INSERT INTO bookmark_fts(rowid, title, memo, markdown, url)
					VALUES (
						(SELECT rowid FROM bookmark WHERE id = ?),
						?, ?, ?, ?
					)
				`,
				args: [
					data.id,
					segment(data.title),
					segment(data.memo),
					segmentMarkdown(data.markdown),
					segmentUrl(data.url),
				],
			});
		}

		await db.client.batch(batch, 'write');
	},

	async import(bookmarks) {
		const rs = await db.client.execute('SELECT url FROM bookmark');
		const existingUrls = new Set(rs.rows.map(r => r.url));

		const newBookmarks = bookmarks
			.filter(b => !existingUrls.has(b.url))
			.map(b => Object.assign(db.createBookmark(), b));

		if (newBookmarks.length > 0)
			await this.save(newBookmarks);

		return newBookmarks.length;
	},

	async deleteById(id) {
		await db.client.batch([
			{
				sql: 'DELETE FROM bookmark_fts WHERE rowid = (SELECT rowid FROM bookmark WHERE id = ?)',
				args: [id],
			},
			{
				sql: 'DELETE FROM bookmark WHERE id = ?',
				args: [id],
			},
		], 'write');
	},

	async getRecent({ columns = ['*'], limit = 100, sortBy = 'updated_at' } = {}) {
		const rs = await db.client.execute({
			sql: `
				SELECT ${columns.join(', ')} FROM bookmark
				ORDER BY ${sortBy} DESC, updated_at DESC
				LIMIT ?
			`,
			args: [limit],
		});

		const totalCount = await db.getTotalCount();
		return {
			totalCount,
			count: totalCount,
			bookmarks: rs.rows.map(r => this._parse(r)),
		};
	},

	async getTags() {
		const rs = await db.client.execute(`
			SELECT DISTINCT value as tag FROM bookmark, json_each(tags)
			ORDER BY tag
		`);
		return rs.rows.map(r => r.tag);
	},

	async existsTag(tag) {
		const rs = await db.client.execute({
			sql: `
				SELECT 1 FROM bookmark, json_each(tags)
				WHERE value = ? LIMIT 1
			`,
			args: [tag],
		});
		return rs.rows.length > 0;
	},

	async search({
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

		logger.trace({ sql, searchParams }, 'executing search query');

		const rs = await db.client.execute({ sql, args: searchParams });
		const totalCount = await db.getTotalCount();
		return {
			count: rs.rows.length,
			totalCount,
			bookmarks: rs.rows.map(r => this._parse(r)),
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

			// FTS5のカラム指定形式を生成(指定があれば { col1 col2 } : の形式)
			// (無指定の場合 全FTSカラムが対象となる)
			const columnSpec = fields.length > 0 ? `{ ${fields.join(' ')} } : ` : '';
			const ftsTokens = tokens.map(token => {
				// 1文字 Uni-gram をフレーズとして結合し、隣接マッチを実現(NEAR(len - 2)相当)
				const phrase = [...normalizeJp(token)].map(c => c.replace(/"/g, '""')).join(' ');
				return `${columnSpec}"${phrase}"`;
			});
			ftsSql = ftsTokens.join(' AND ');
		}

		return { conditions, params, ftsSql };
	},

	_parse(row) {
		if (row) {
			// Proxy等で扱いやすいよう、深いコピーを作るか、プロパティを整形
			const parsed = { ...row };
			if (parsed.tags)
				parsed.tags = JSON.parse(parsed.tags);
			return parsed;
		}
		return row;
	},
};

export default store;
