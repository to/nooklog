import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';

import config from './config.js';
import baseLog from './log.js';
import sentence from './sentence/index.js';

const log = baseLog.child({ module: 'database' });

const database = {
	client: null,

	async initialize() {
		let dbUrl = config['server.data.path'];
		if (dbUrl !== ':memory:') {
			const dbDir = path.join(config['server.data.path'], 'database');
			if (!fs.existsSync(dbDir))
				fs.mkdirSync(dbDir, { recursive: true });

			dbUrl = `file:${path.join(dbDir, 'nooklog.db')}`;
		}
		log.info({ path: dbUrl }, 'opening libsql database');

		this.client = createClient({
			url: dbUrl,
		});

		// 高速な検索と並列読み書きを可能にするパフォーマンス設定 (WALモード)
		await this.client.execute('PRAGMA journal_mode = WAL');
		await this.client.execute('PRAGMA synchronous = NORMAL');
		await this.client.execute('PRAGMA foreign_keys = ON');

		await this.createTables();
		await this.initializeFtsTable();
		await this.initializeVectorTable();
	},

	async createTables() {
		await this.client.batch([
			`CREATE TABLE IF NOT EXISTS bookmark (
				row_id INTEGER PRIMARY KEY AUTOINCREMENT,
				id TEXT UNIQUE NOT NULL,
				url TEXT,
				title TEXT,
				memo TEXT,
				rating INTEGER,
				tags TEXT, -- JSON array
				created_at INTEGER,
				updated_at INTEGER,
				html TEXT,
				markdown TEXT,
				summary TEXT,
				meta TEXT DEFAULT '{}' -- JSON object for management
			)`,
			`CREATE TABLE IF NOT EXISTS meta (
				id TEXT PRIMARY KEY,
				value TEXT
			)`,
			'CREATE INDEX IF NOT EXISTS bookmark_updated_at_idx ON bookmark (updated_at DESC)',
			'CREATE INDEX IF NOT EXISTS bookmark_created_at_idx ON bookmark (created_at DESC)',
			'CREATE INDEX IF NOT EXISTS bookmark_rating_idx ON bookmark (rating)',
		], 'write');
	},

	async initializeFtsTable() {
		const current = config['database.tokenizer'];
		const old = await this.getMeta('fts_tokenizer');
		if (old !== current) {
			log.info({ from: old || 'none', to: current }, 'tokenizer changed, re-initializing FTS table');

			const tokenizerString = current === 'unigram'
				? "unicode61 categories 'L* N* P* S*'"
				: 'porter unicode61';
			await this.client.batch([
				'DROP TABLE IF EXISTS bookmark_fts',
				`CREATE VIRTUAL TABLE bookmark_fts USING fts5(
					title,
					memo,
					markdown,
					url,
					tokenize="${tokenizerString}"
				)`,
			], 'write');

			await this.setMeta('fts_tokenizer', current);
		}
	},

	async initializeVectorTable() {
		const current = sentence.model;
		const old = await this.getMeta('vector_model');
		if (old !== current) {
			log.info({
				from: old || 'none',
				to: current,
				dimension: sentence.dimension,
			}, 'model changed, re-initializing vector table');

			await this.client.batch([
				'DROP TABLE IF EXISTS bookmark_vector',
				`CREATE TABLE bookmark_vector (
					row_id INTEGER PRIMARY KEY,
					bookmark_id INTEGER,
					chunk_index INTEGER,
					field TEXT,
					content TEXT,
					position INTEGER,
					vector F32_BLOB(${sentence.dimension}),
					FOREIGN KEY (bookmark_id) REFERENCES bookmark(row_id) ON DELETE CASCADE
				)`,
				'CREATE INDEX bookmark_vector_bookmark_id_idx ON bookmark_vector (bookmark_id)',
			], 'write');

			await this.setMeta('vector_model', current);
		}
	},

	createBookmark() {
		const now = Date.now();
		return {
			id: crypto.randomUUID(),
			url: '',
			title: '',
			memo: '',
			rating: 0,
			tags: [],
			summary: '',
			html: '',
			markdown: '',
			meta: {},
			created_at: now,
			updated_at: now,
		};
	},

	async getMeta(id) {
		const rs = await this.client.execute({
			sql: 'SELECT value FROM meta WHERE id = ?',
			args: [id],
		});
		return rs.rows[0]?.value;
	},

	async setMeta(id, value) {
		await this.client.execute({
			sql: 'INSERT OR REPLACE INTO meta (id, value) VALUES (?, ?)',
			args: [id, value],
		});
	},

	async getTotalCount() {
		const rs = await this.client.execute('SELECT count(*) as count FROM bookmark');
		return rs.rows[0].count;
	},

	async count({ from, where, args }) {
		const sql = `SELECT count(*) as count ${from} ${where ? `WHERE ${where}` : ''}`;
		const rs = await this.client.execute({ sql, args });
		return rs.rows[0].count;
	},

	close() {
		log.info('closing database');
		this.client?.close();
	},
};

export default database;
