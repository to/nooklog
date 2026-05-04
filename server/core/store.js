import sentence from './sentence/index.js';
import db from './database.js';
import config from './config.js';
import baseLog from './log.js';
import _, { bench } from './util.js';
import queue from './queue.js';
import hub from './hub.js';

const log = baseLog.child({ module: 'store' });

const store = {
	UNLIMITED: null,

	async dispose() {
		log.info('disposing store');
		await this.reembedJob?.abort();
		await this.reindexJob?.abort();
	},

	async find({ id, url, columns = ['*'] } = {}) {
		if (!id && !url)
			return null;

		const rows = await db.execute({
			sql: `SELECT ${columns.join(', ')} FROM bookmark WHERE ${id ? 'id' : 'url'} = ?`,
			args: [id || url],
		});
		return this._parse(rows[0]);
	},

	async query(sql, args = []) {
		const rows = await db.execute({ sql, args });
		return rows.map(r => this._parse(r));
	},

	async save(bookmarks, { fts = true, embed = true, embedFields = null } = {}) {
		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		const batch = [];
		for (let b of bookmarks) {
			b = _.merge(db.createBookmark(), b);
			batch.push({
				sql: `
					INSERT OR REPLACE INTO bookmark (
						row_id, id, url, title, memo, rating, tags, created_at, updated_at, html, markdown, summary, meta
					) VALUES ((SELECT row_id FROM bookmark WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					b.id, b.id, b.url, b.title, b.memo, b.rating,
					JSON.stringify(b.tags || []),
					b.created_at, b.updated_at, b.html, b.markdown, b.summary,
					JSON.stringify(b.meta || {}),
				],
			});
		}

		await db.client.batch(batch, 'write');

		if (fts)
			this.indexFts(bookmarks);

		if (embed)
			this.embed(bookmarks, { fields: embedFields });
	},

	indexFts(bookmarks, { priority = 20 } = {}) {
		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		const useUnigram = config['database.tokenizer'] === 'unigram';
		return queue.batch(bookmarks, async slice => {
			const batch = slice.flatMap(b => [
				{
					sql: 'DELETE FROM bookmark_fts WHERE rowid = (SELECT row_id FROM bookmark WHERE id = ?)',
					args: [b.id],
				},
				{
					sql: `
						INSERT INTO bookmark_fts(rowid, title, memo, summary, markdown, url)
						VALUES ((SELECT row_id FROM bookmark WHERE id = ?), ?, ?, ?, ?, ?)`,
					args: [
						b.id,
						useUnigram ? sentence.segment(b.title) : sentence.normalizeJp(b.title),
						useUnigram ? sentence.segment(b.memo) : sentence.normalizeJp(b.memo),
						useUnigram ? sentence.segment(b.summary) : sentence.normalizeJp(b.summary),
						useUnigram ? sentence.segmentMarkdown(b.markdown) : sentence.cleanMarkdown(b.markdown),
						useUnigram ? sentence.segmentUrl(b.url) : sentence.cleanUrl(b.url),
					],
				},
			]);

			await db.client.batch(batch, 'write');
		}, { priority, size: 50, label: 'FTS Indexing' });
	},

	embed(bookmarks, { priority = 10, fields = null } = {}) {
		if (!config['sentence.vector.enabled'])
			return;

		bookmarks = Array.isArray(bookmarks) ? bookmarks : [bookmarks];

		return queue.batch(bookmarks, async slice => {
			const batch = [];

			// Fetch row_ids for all bookmarks in the slice
			const ids = slice.map(b => b.id);
			const idMap = new Map((await db.execute({
				sql: `SELECT id, row_id FROM bookmark WHERE id IN (${ids.map(() => '?').join(',')})`,
				args: ids,
			})).map(r => [r.id, r.row_id]));

			for (let b of slice) {
				const rowId = idMap.get(b.id);
				if (rowId == null)
					continue;

				b = { ...db.createBookmark(), ...b };

				if (fields) {
					batch.push({
						sql: `DELETE FROM bookmark_vector WHERE bookmark_id = ? AND (field IN (${fields.map(() => '?').join(',')}) OR field = 'none')`,
						args: [rowId, ...fields],
					});
				} else {
					batch.push({
						sql: 'DELETE FROM bookmark_vector WHERE bookmark_id = ?',
						args: [rowId],
					});
				}

				let targets = [];

				if (!fields || fields.includes('title'))
					targets.push({ field: 'title', title: b.title, position: 0 });
				if (!fields || fields.includes('summary'))
					targets.push({ field: 'summary', text: b.summary, position: 0 });
				if (!fields || fields.includes('memo'))
					targets.push({ field: 'memo', text: b.memo, position: 0 });

				// Set H2 or higher as title
				if (!fields || fields.includes('markdown')) {
					targets.push(...sentence.chunkMarkdown(b.markdown).map(c => ({
						field: 'markdown',
						title: c.titles
							.filter(t => t.startsWith('##'))
							.map(t => t.replace(/^#+\s*/, ''))
							.join(' > '),
						text: c.text,
						position: c.position.offset,
					})));
				}

				for (const field of ['summary', 'memo']) {
					if (fields && !fields.includes(field))
						continue;

					const chunks = sentence.split(b[field]);
					if (chunks.length > 1) {
						targets.push(...chunks.map(c => ({
							field,
							text: c.text,
							position: c.position,
						})));
					}
				}

				targets = targets.filter(t => t.text?.trim() || t.title?.trim());

				if (targets.length === 0) {
					// Mark as processed to prevent infinite re-embedding loop
					if (!fields) {
						batch.push({
							sql: `
							INSERT INTO bookmark_vector (
								bookmark_id, chunk_index, field, content, position, vector
							) VALUES (?, 0, 'none', '', 0, NULL)`,
							args: [rowId],
						});
					}
					continue;
				}

				// Vectorize (pass title and body together)
				const vectors = await sentence.embedDocument(targets);
				batch.push(...targets.map((t, i) => ({
					sql: `
					INSERT INTO bookmark_vector (
						bookmark_id, chunk_index, field, content, position, vector
					) VALUES (?, ?, ?, ?, ?, vector32(?))`,
					args: [
						rowId, i, t.field, [t.title, t.text].filter(Boolean).join('\n'), t.position,
						JSON.stringify(vectors[i]),
					],
				})));
			}

			await db.client.batch(batch, 'write');
		}, { priority, size: 10, label: 'Embedding' });
	},

	async reembed() {
		if (!config['sentence.vector.enabled'])
			return;

		try {
			await db.initializeVectorTable();
		} catch (error) {
			log.warn({ cause: error.message }, 'failed to initialize sentence vector');
			return;
		}

		await this.reembedJob?.abort();

		const bookmarks = await db.execute(`
			SELECT id, title, memo, summary, markdown FROM bookmark
			WHERE row_id NOT IN (SELECT DISTINCT bookmark_id FROM bookmark_vector)
			ORDER BY updated_at DESC`);
		if (bookmarks.length === 0)
			return;

		log.info({ count: bookmarks.length }, 're-embedding missing vectors');
		this.reembedJob = this.embed(bookmarks, { priority: 2 });

		return this.reembedJob;
	},

	async reindexFts() {
		await db.initializeFtsTable();

		await this.reindexJob?.abort();

		const bookmarks = await db.execute(`
			SELECT id, title, memo, summary, markdown, url FROM bookmark
			WHERE row_id NOT IN (SELECT rowid FROM bookmark_fts)`);
		if (bookmarks.length === 0)
			return;

		log.info({ count: bookmarks.length }, 're-indexing bookmarks in FTS');
		this.reindexJob = this.indexFts(bookmarks, { priority: 5 });

		return this.reindexJob;
	},

	async getBackfillContentTargets({ limit = 100, force = false } = {}) {
		const sql = `
			SELECT * FROM bookmark
			WHERE (markdown IS NULL OR markdown = '' OR title IS NULL OR title = '')
			${force ? '' : "AND json_extract(meta, '$.fetch_error') IS NULL"}
			ORDER BY created_at DESC
			LIMIT ?`;
		return await this.query(sql, [limit]);
	},

	async import(bookmarks) {
		const rows = await db.execute('SELECT url FROM bookmark');
		let urls = new Set(rows.map(r => r.url));

		const newBookmarks = bookmarks
			.filter(b => !urls.has(b.url) && urls.add(b.url))
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
		return await db.execute(`
			SELECT value as tag, COUNT(*) as count FROM bookmark, json_each(tags)
			GROUP BY tag`);
	},

	async search(ps) {
		// Is this search only based on URL/Tag/Rating?
		if (ps.query?.trim()) {
			if (ps.mode === 'vector')
				return await this.searchVector(ps);
			if (ps.mode === 'hybrid')
				return await this.searchHybrid(ps);
		}
		return await this.searchFTS(ps);
	},

	async searchFTS({
		columns = ['*'], tags = [], query = '', url = '', fields = [], rating, from, to, sortBy = 'created_at', limit = 300,
	}) {
		const {
			conditions, params, ftsConditions, ftsParams,
		} = this._buildSearchQuery({
			tags, query, url, fields, rating, from, to,
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

		let orderBy = 'created_at DESC';
		if (sortBy === 'relevance') {
			if (hasFts)
				orderBy = 'f.rank';
		} else if (sortBy === 'rating') {
			orderBy = 'rating DESC, created_at DESC';
		} else if (sortBy === 'updated_at') {
			orderBy = 'updated_at DESC';
		}
		sql += ` ORDER BY ${orderBy}`;

		let args = [...allParams];
		if (limit !== null) {
			sql += ' LIMIT ?';
			args.push(limit);
		}

		const rows = await db.execute({ sql, args });
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
			bookmarks: rows.map(r => this._parse(r)),
		};
	},

	async searchVector({
		columns = ['*'], query = '', url = '', fields = [], limit = 50, sortBy = 'relevance',
		tags = [], rating, from, to, useVectorIndex = true,
	}) {
		if (!query?.trim() || !config['sentence.vector.enabled'])
			return { count: 0, totalCount: await db.getTotalCount(), bookmarks: [] };

		const qVec = await sentence.embedQuery(query);
		const select = columns.map(c => `b.${c}`).join(', ');

		const {
			conditions, params, ftsConditions, ftsParams,
		} = this._buildSearchQuery({ tags, rating, url, from, to });
		const qVecJson = JSON.stringify(qVec);

		let sql;
		const args = [];

		if (useVectorIndex && config['database.useVectorIndex']) {
			// ANN Search using index
			// We fetch a larger number of chunks (limit * 5) to account for multiple chunks per bookmark
			const k = limit === null ? 300 : limit * 5;
			sql = `
				SELECT ${select}, bv.content as chunk, bv.field as chunkField,
				       MIN(vector_distance_cos(bv.vector, vector32(?))) as score
				FROM vector_top_k('bookmark_vector_idx', vector32(?), ?) as v
				JOIN bookmark_vector bv ON bv.row_id = v.rowid
				JOIN bookmark b ON b.row_id = bv.bookmark_id`;
			args.push(qVecJson, qVecJson, k);
		} else {
			// Brute Force search
			sql = `
				SELECT ${select}, bv.content as chunk, bv.field as chunkField,
				       MIN(vector_distance_cos(bv.vector, vector32(?))) as score
				FROM bookmark_vector bv
				JOIN bookmark b ON b.row_id = bv.bookmark_id`;
			args.push(qVecJson);
		}

		if (ftsConditions.length > 0)
			sql += ' JOIN bookmark_fts f ON f.rowid = b.row_id';

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

		// Truncate at moderate similarity upon export
		if (limit === null) {
			const { near, far } = await sentence.getCalibration();
			sql += ' HAVING score <= ?';
			args.push(near * 0.2 + far * 0.8);
		}

		if (sortBy === 'relevance')
			sql += ' ORDER BY score';
		else
			sql += ` ORDER BY b.${sortBy} DESC, score`;

		if (limit !== null) {
			sql += ' LIMIT ?';
			args.push(limit);
		}

		const rows = await db.execute({ sql, args });
		return {
			count: rows.length,
			totalCount: await db.getTotalCount(),
			bookmarks: rows.map(r => this._parse(r)),
		};
	},

	async searchHybrid(ps) {
		// Fetch extra candidates for consolidation
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
		tags = [], query = '', url = '', fields = [], rating, from, to,
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

		if (from) {
			conditions.push('b.created_at >= ?');
			params.push(from instanceof Date ? from.getTime() : from);
		}

		if (to) {
			conditions.push('b.created_at <= ?');
			params.push(to instanceof Date ? to.getTime() : to);
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

		// Split token considering phrase ("...")
		const tokens = (query.match(/".+?"|[^\s"]+/g) || [])
			.map(w => w.replace(/^"|"$/g, ''));

		// Construct FTS5 column syntax (if specified, format looks like { col1 col2 } :)
		// (Defaults to all FTS columns)
		const columnSpec = fields.length > 0 ? `{ ${fields.join(' ')} } : ` : '';
		const useUnigram = config['database.tokenizer'] === 'unigram';
		const ftsTokens = tokens.map(token => {
			if (useUnigram) {
				// Merge phrase using Uni-gram to simulate adjacency (NEAR(len - 2) equivalence)
				const phrase = [...sentence.normalizeJp(token)].map(c => c.replace(/"/g, '""')).join(' ');
				return `${columnSpec}"${phrase}"`;
			} else {
				// Word level: append "*" if needed for prefix matching
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
			// Deep clone or format properties for proxies
			const parsed = { ...row };
			if (parsed.tags)
				parsed.tags = JSON.parse(parsed.tags);
			if (parsed.meta)
				parsed.meta = JSON.parse(parsed.meta);
			return parsed;
		}
		return row;
	},
};

// Backfill once embedding engine is ready (recovers from error)
hub.on('vector.ready', () => store.reembed());

export default store;
