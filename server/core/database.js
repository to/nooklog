import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';
import os from 'os';

import config from './config.js';
import baseLog from './log.js';
import sentence from './sentence/index.js';

const log = baseLog.child({ module: 'database' });

const dataPath = process.env.NOOKLOG_DATA_PATH || (
	process.platform === 'linux'
		? '/data'
		: path.join(os.homedir(), '.nooklog', 'data'));

const database = {
	client: null,

	async initialize() {
		const isReadOnly = ['demo', 'lite'].includes(process.env.NOOKLOG_MODE);

		const dbDir = path.join(dataPath, 'database');
		if (!fs.existsSync(dbDir))
			fs.mkdirSync(dbDir, { recursive: true });
		const localDbUrl = `file:${path.join(dbDir, 'nooklog.db')}`;

		const tursoUrl = process.env.TURSO_DATABASE_URL;
		const authToken = process.env.TURSO_AUTH_TOKEN;
		if (tursoUrl && authToken) {
			if (process.env.TURSO_REPLICA === 'true') {
				// Turso Embedded Replica Mode (Local Cache + Sync)
				log.info({ path: localDbUrl, sync: tursoUrl }, 'opening libsql database with Turso sync');
				this.client = createClient({
					url: localDbUrl,
					syncUrl: tursoUrl,
					authToken: authToken,
				});

				try {
					await this.client.sync();
				} catch (e) {
					log.warn({ error: e.message }, 'initial sync failed, proceeding with local cache');
				}
			} else {
				// Turso Remote Only Mode (Direct Connection)
				log.info({ url: tursoUrl }, 'opening remote libsql database');
				this.client = createClient({
					url: tursoUrl,
					authToken: authToken,
				});
			}
		} else {
			// Standard Local Mode
			log.info({ path: localDbUrl }, 'opening local libsql database');
			this.client = createClient({
				url: localDbUrl,
			});
		}

		// パフォーマンス設定 (純粋なローカルモード かつ 書き込み可能なときだけ実行)
		if (!tursoUrl && !isReadOnly) {
			await this.client.execute('PRAGMA journal_mode = WAL');
			await this.client.execute('PRAGMA synchronous = NORMAL');
			await this.client.execute('PRAGMA foreign_keys = ON');
		}

		// デモモード（リードオンリー）対策：書き込み禁止エラーを無視するラッパーを被せる
		if (isReadOnly) {
			for (const m of ['execute', 'batch']) {
				const origin = this.client[m].bind(this.client);
				this.client[m] = async (...args) => {
					try {
						return await origin(...args);
					} catch (e) {
						if (e.code === 'BLOCKED' || e.code === 'SQLITE_READONLY') {
							return m === 'execute'
								? { rows: [] }
								: [];
						}
						throw e;
					}
				};
			}
		}

		await this.createTables();
		await this.loadConfig();

		log.info('database initialized and config restored');
	},

	async loadConfig() {
		Object.assign(config, JSON.parse(await this.getMeta('config') || '{}'));
		if (process.env.PORT)
			config['server.port'] = parseInt(process.env.PORT, 10);
		config['server.mode'] = process.env.NOOKLOG_MODE || 'normal';
		config['server.readonly'] = ['demo', 'lite'].includes(config['server.mode']);
		config['server.disableAi'] = config['sentence.provider'] === 'none' || config['server.readonly'];
		config['server.data.path'] = dataPath;
		config['sentence.cachePath'] = path.join(dataPath, '.cache');
	},

	async saveConfig(input) {
		Object.assign(config, input);
		await this.setMeta('config', JSON.stringify(config));
	},

	async initializeSearch() {
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
		if (config['sentence.provider'] === 'none')
			return;

		const current = sentence.model;
		const old = await this.getMeta('vector_model');
		if (old !== current) {
			const dimension = await sentence.getDimension();
			log.info({
				from: old || 'none',
				to: current,
				dimension,
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
					vector F32_BLOB(${dimension}),
					FOREIGN KEY (bookmark_id) REFERENCES bookmark(row_id) ON DELETE CASCADE
				)`,
				'CREATE INDEX bookmark_vector_bookmark_id_idx ON bookmark_vector (bookmark_id)',
			], 'write');

			await this.setMeta('vector_model', current);
		}
	},

	close() {
		log.info('closing database');
		this.client?.close();
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
};

await database.initialize();

export default database;
