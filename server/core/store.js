import sentence from './sentence/index.js';
import db from './database.js';
import config from './config.js';
import baseLog from './log.js';
import _, { bench } from './util.js';
import queue from './queue.js';

const log = baseLog.child({ module: 'store' });

const store = {
	UNLIMITED: null,

	async initialize() {
		await this.dispose();
	},

	async dispose() {
		await this.backfillJob?.abort();
		await this.reindexJob?.abort();
	},

	async find({ id, url, columns = ['*'] } = {}) {
		if (!id && !url)
			return null;

		const rs = await db.client.execute({
			sql: `SELECT ${columns.join(', ')} FROM bookmark WHERE ${id ? 'id' : 'url'} = ?`,
			args: [id || url],
		});
		return this._parse(rs.rows[0]);
	},

	async save(bookmarks) {
		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		const batch = [];
		for (const b of bookmarks) {
			const data = {
				...db.createBookmark(),
				...b,
			};

			batch.push({
				sql: `
					INSERT OR REPLACE INTO bookmark (
						id, url, title, memo, rating, tags, created_at, updated_at, html, markdown, summary, meta
					) VALUES (
						?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
					)`,
				args: [
					data.id, data.url, data.title, data.memo, data.rating,
					JSON.stringify(data.tags || []),
					data.created_at, data.updated_at, data.html, data.markdown, data.summary,
					JSON.stringify(data.meta || {}),
				],
			});
		}

		await db.client.batch(batch, 'write');

		// バックグラウンドでインデックス・ベクトル化を開始
		this.indexFts(bookmarks).catch(err => {
			log.error(err, 'failed to index FTS in background');
		});

		this.embed(bookmarks).catch(err => {
			log.error(err, 'failed to index vectors in background');
		});
	},

	indexFts(bookmarks, { priority = 20 } = {}) {
		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		const useUnigram = config['database.tokenizer'] === 'unigram';
		return queue.batch(bookmarks, async slice => {
			const batch = slice.flatMap(data => [
				{
					sql: 'DELETE FROM bookmark_fts WHERE rowid = (SELECT row_id FROM bookmark WHERE id = ?)',
					args: [data.id],
				},
				{
					sql: `
						INSERT INTO bookmark_fts(rowid, title, memo, markdown, url)
						VALUES ((SELECT row_id FROM bookmark WHERE id = ?), ?, ?, ?, ?)`,
					args: [
						data.id,
						useUnigram ? sentence.segment(data.title) : sentence.normalizeJp(data.title),
						useUnigram ? sentence.segment(data.memo) : sentence.normalizeJp(data.memo),
						useUnigram ? sentence.segmentMarkdown(data.markdown) : sentence.cleanMarkdown(data.markdown),
						useUnigram ? sentence.segmentUrl(data.url) : sentence.cleanUrl(data.url),
					],
				},
			]);

			await db.client.batch(batch, 'write');
		}, { priority, size: 50, label: 'FTS Indexing' });
	},

	embed(bookmarks, { priority = 10 } = {}) {
		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		return queue.batch(bookmarks, async (slice, i, signal) => {
			const batch = [];
			for (const b of slice) {
				const data = { ...db.createBookmark(), ...b };

				batch.push({
					sql: 'DELETE FROM bookmark_vector WHERE bookmark_id = (SELECT row_id FROM bookmark WHERE id = ?)',
					args: [data.id],
				});

				let targets = [
					{ field: 'title', title: data.title, position: 0 },
					{ field: 'memo', text: data.memo, position: 0 },
				];

				// H2以上の見出しをタイトルにする
				targets.push(...sentence.chunkMarkdown(data.markdown).map(c => ({
					field: 'markdown',
					title: c.titles
						.filter(t => t.startsWith('##'))
						.map(t => t.replace(/^#+\s*/, ''))
						.join(' > '),
					text: c.text,
					position: c.position.offset,
				})));

				const memoChunks = sentence.split(data.memo);
				if (memoChunks.length > 1) {
					targets.push(...memoChunks.map(c => ({
						field: 'memo',
						text: c.text,
						position: c.position,
					})));
				}

				targets = targets.filter(t => t.text?.trim() || t.title?.trim());

				if (targets.length === 0)
					continue;

				// ベクトル化 (タイトルと本文をセットで渡す)
				const vectors = await sentence.embedDocument(targets);
				batch.push(...targets.map((t, i) => ({
					sql: `
					INSERT INTO bookmark_vector (
						bookmark_id, chunk_index, field, content, position, vector
					) VALUES ((SELECT row_id FROM bookmark WHERE id = ?), ?, ?, ?, ?, vector32(?))`,
					args: [
						data.id, i, t.field, [t.title, t.text].filter(Boolean).join('\n'), t.position,
						JSON.stringify(vectors[i]),
					],
				})));
			}

			await db.client.batch(batch, 'write');
		}, { priority, size: 10, label: 'Embedding' });
	},

	async backfill() {
		await this.backfillJob?.abort();

		const rs = await db.client.execute(`
			SELECT id, title, memo, markdown FROM bookmark
			WHERE row_id NOT IN (SELECT DISTINCT bookmark_id FROM bookmark_vector)
			ORDER BY updated_at DESC`);
		const bookmarks = rs.rows;
		if (bookmarks.length === 0)
			return;

		log.info({ count: bookmarks.length }, 'backfilling missing vectors');
		this.backfillJob = this.embed(bookmarks, { priority: 2 });

		return this.backfillJob;
	},

	async reindexFts() {
		await this.reindexJob?.abort();

		const rs = await db.client.execute(`
			SELECT id, title, memo, markdown, url FROM bookmark
			WHERE row_id NOT IN (SELECT rowid FROM bookmark_fts)`);
		const bookmarks = rs.rows;
		if (bookmarks.length === 0)
			return;

		log.info({ count: bookmarks.length }, 're-indexing bookmarks in FTS');
		this.reindexJob = this.indexFts(bookmarks, { priority: 5 });

		return this.reindexJob;
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

	async delete(id) {
		await db.client.batch([
			{
				sql: 'DELETE FROM bookmark_vector WHERE bookmark_id = (SELECT row_id FROM bookmark WHERE id = ?)',
				args: [id],
			},
			{
				sql: 'DELETE FROM bookmark_fts WHERE rowid = (SELECT row_id FROM bookmark WHERE id = ?)',
				args: [id],
			},
			{
				sql: 'DELETE FROM bookmark WHERE id = ?',
				args: [id],
			},
		], 'write');
	},

	async getTags() {
		const rs = await db.client.execute(`
			SELECT DISTINCT value as tag FROM bookmark, json_each(tags)
			ORDER BY tag`);
		return rs.rows.map(r => r.tag);
	},

	async existsTag(tag) {
		const rs = await db.client.execute({
			sql: `
				SELECT 1 FROM bookmark, json_each(tags)
				WHERE value = ? LIMIT 1`,
			args: [tag],
		});
		return rs.rows.length > 0;
	},

	async search(ps) {
		// URL/タグ/レーティングだけの検索ではないか？
		if (ps.query?.trim()) {
			if (ps.mode === 'vector')
				return await this.searchVector(ps);
			if (ps.mode === 'hybrid')
				return await this.searchHybrid(ps);
		}
		return await this.searchFTS(ps);
	},

	async searchFTS({
		columns = ['*'], tags = [], query = '', url = '', fields = [], rating, sortBy = 'updated_at', limit = 300,
	}) {
		const {
			conditions, params, ftsConditions, ftsParams,
		} = this._buildSearchQuery({
			tags, query, url, fields, rating,
		});

		const hasFts = ftsConditions.length > 0;
		const select = (hasFts ? columns.map(c => `b.${c}`) : columns).join(', ');

		const selectSql = hasFts ? `${select}, f.rank as score` : select;
		const fromSql = hasFts
			? 'FROM bookmark b JOIN bookmark_fts f ON f.rowid = b.row_id'
			: 'FROM bookmark b';

		let sql = `SELECT ${selectSql} ${fromSql}`;

		const allConditions = [...ftsConditions, ...conditions];
		const allParams = [...ftsParams, ...params];

		if (allConditions.length > 0)
			sql += ' WHERE ' + allConditions.join(' AND ');

		let orderBy = 'updated_at DESC';
		if (sortBy === 'relevance') {
			if (hasFts)
				orderBy = 'f.rank';
		} else if (sortBy !== 'updated_at') {
			orderBy = `${sortBy} DESC, updated_at DESC`;
		}
		sql += ` ORDER BY ${orderBy}`;

		let args = [...allParams];
		if (limit !== null) {
			sql += ' LIMIT ?';
			args.push(limit);
		}

		const rs = await db.client.execute({ sql, args });
		const totalCount = await db.getTotalCount();

		let count = totalCount;
		if (allConditions.length > 0) {
			count = await db.count({
				from: fromSql,
				where: allConditions.join(' AND '),
				args: allParams,
			});
		}

		return {
			count,
			totalCount,
			bookmarks: rs.rows.map(r => this._parse(r)),
		};
	},

	async searchVector({
		columns = ['*'], query = '', url = '', fields = [], limit = 50, sortBy = 'relevance',
		tags = [], rating,
	}) {
		if (!query?.trim())
			return { count: 0, totalCount: await db.getTotalCount(), bookmarks: [] };

		const qVec = await sentence.embedQuery(query);
		const select = columns.map(c => `b.${c}`).join(', ');

		// インデックス(DiskANN)は不正確だったため5倍程度遅い全件走査(Brute Force)を使用する
		const {
			conditions, params, ftsConditions, ftsParams,
		} = this._buildSearchQuery({ tags, rating, url });
		const qVecJson = JSON.stringify(qVec);
		let sql = `
			SELECT ${select}, bv.content as chunk, bv.field as chunkField,
			       MIN(vector_distance_cos(bv.vector, vector32(?))) as score
			FROM bookmark_vector bv
			JOIN bookmark b ON b.row_id = bv.bookmark_id`;

		if (ftsConditions.length > 0)
			sql += ' JOIN bookmark_fts f ON f.rowid = b.row_id';

		const args = [qVecJson];
		const where = [...ftsConditions];
		args.push(...ftsParams);

		if (fields.length > 0) {
			where.push('bv.field IN (SELECT value FROM json_each(?))');
			args.push(JSON.stringify(fields));
		}
		if (conditions.length > 0) {
			where.push(...conditions);
			args.push(...params);
		}

		if (where.length > 0)
			sql += ' WHERE ' + where.join(' AND ');

		sql += ' GROUP BY b.id';

		// エクスポート時は 適度な類似度で切り捨てる
		if (limit === null) {
			sql += ' HAVING score <= ?';
			args.push(sentence.near * 0.2 + sentence.far * 0.8);
		}

		if (sortBy === 'relevance')
			sql += ' ORDER BY score';
		else
			sql += ` ORDER BY b.${sortBy} DESC, score`;

		if (limit !== null) {
			sql += ' LIMIT ?';
			args.push(limit);
		}

		const rs = await db.client.execute({ sql, args });
		return {
			count: rs.rows.length,
			totalCount: await db.getTotalCount(),
			bookmarks: rs.rows.map(r => this._parse(r)),
		};
	},

	async searchHybrid(ps) {
		// 統合するために候補を多めに取得する
		const { limit = 50, sortBy = 'relevance' } = ps;
		const searchLimit = limit === null ? null : Math.floor(limit * 1.5);
		const [fts, vec] = await Promise.all([
			this.searchFTS({ ...ps, limit: searchLimit, sortBy: 'relevance' }),
			this.searchVector({ ...ps, limit: searchLimit, sortBy: 'relevance' }),
		]);

		const k = 60;
		const scores = new Map();
		const bookmarksMap = new Map();

		// RRF (Reciprocal Rank Fusion) Score
		const addRRF = (bookmarks, weight = 1.0) => {
			bookmarks.forEach((b, i) => {
				const rank = i + 1;
				const score = (1 / (k + rank)) * weight;
				scores.set(b.id, (scores.get(b.id) || 0) + score);
				if (!bookmarksMap.has(b.id))
					bookmarksMap.set(b.id, b);
			});
		};
		addRRF(fts.bookmarks, 1.0);
		addRRF(vec.bookmarks, 0.5);

		const sortedIds = [...scores.keys()].sort((a, b) => scores.get(b) - scores.get(a));
		const bookmarks = sortedIds.slice(0, limit).map(id => bookmarksMap.get(id));
		if (sortBy !== 'relevance') {
			bookmarks.sort((a, b) => {
				if (a[sortBy] < b[sortBy])
					return 1;
				if (a[sortBy] > b[sortBy])
					return -1;
				return 0;
			});
		}

		return {
			count: bookmarks.length,
			totalCount: fts.totalCount,
			bookmarks,
		};
	},

	_buildSearchQuery({
		tags = [], query = '', url = '', fields = [], rating,
	}) {
		const conditions = [];
		const params = [];
		const ftsConditions = [];
		const ftsParams = [];

		if (tags.length > 0) {
			for (const tag of tags) {
				conditions.push('EXISTS (SELECT 1 FROM json_each(b.tags) WHERE value = ?)');
				params.push(tag);
			}
		}

		if (rating != null) {
			conditions.push('b.rating >= ?');
			params.push(rating);
		}

		const ftsUrl = this._buildFtsMatch(url, ['url']);
		if (ftsUrl) {
			ftsConditions.push(ftsUrl.condition);
			ftsParams.push(ftsUrl.param);
		}

		const fts = this._buildFtsMatch(query, fields);
		if (fts) {
			ftsConditions.push(fts.condition);
			ftsParams.push(fts.param);
		}

		return {
			conditions, params, ftsConditions, ftsParams,
		};
	},

	_buildFtsMatch(query, fields = []) {
		if (!query?.trim())
			return null;

		// フレーズ（"..."）を考慮してトークン分割
		const tokens = (query.match(/".+?"|[^\s"]+/g) || [])
			.map(w => w.replace(/^"|"$/g, ''));

		// FTS5のカラム指定形式を生成(指定があれば { col1 col2 } : の形式)
		// (無指定の場合 全FTSカラムが対象となる)
		const columnSpec = fields.length > 0 ? `{ ${fields.join(' ')} } : ` : '';
		const useUnigram = config['database.tokenizer'] === 'unigram';
		const ftsTokens = tokens.map(token => {
			if (useUnigram) {
				// 1文字 Uni-gram をフレーズとして結合し、隣接マッチを実現(NEAR(len - 2)相当)
				const phrase = [...sentence.normalizeJp(token)].map(c => c.replace(/"/g, '""')).join(' ');
				return `${columnSpec}"${phrase}"`;
			} else {
				// 単語単位: 必要なら末尾に "*" をつけて前方一致を許可
				const cleanToken = token.replace(/"/g, '""');
				return `${columnSpec}"${cleanToken}"*`;
			}
		});

		return {
			condition: 'f.bookmark_fts MATCH ?',
			param: ftsTokens.join(' AND '),
		};
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
