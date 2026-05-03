import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';
import config from './config.js';
import baseLog from './log.js';
import sentence from './sentence/index.js';
import queue from './queue.js';
import { wait } from './util.js';

const log = baseLog.child({ module: 'database' });

const database = {
	client: null,
	vacuumJob: null,

	async initialize() {
		const isReadOnly = config['server.readonly'];

		const dbDir = path.join(config['server.data.path'], 'database');
		if (!fs.existsSync(dbDir))
			fs.mkdirSync(dbDir, { recursive: true });
		const localDbUrl = `file:${path.join(dbDir, 'nooklog.db')}`;

		const tursoUrl = config['database.turso.url'];
		const authToken = config['database.turso.token'];
		if (tursoUrl && authToken) {
			if (config['database.turso.replica']) {
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

		// Performance settings
		if (!isReadOnly) {
			if (!tursoUrl) {
				await this.client.execute('PRAGMA journal_mode = WAL');
				await this.client.execute('PRAGMA synchronous = NORMAL');
			}
			await this.client.execute('PRAGMA foreign_keys = ON');
			await this.client.execute('PRAGMA busy_timeout = 10000');
		}

		// Read-only mode handling: wrap with a proxy that ignores write-blocked errors
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

		await this.migrate();
		await this.loadConfig();

		await this.initializeFtsTable();

		log.info('database initialized and config restored');
	},

	async dispose() {
		log.info('disposing database');
		await this.vacuumJob?.abort();
		this.client?.close();
	},

	async loadConfig() {
		config.setConfig(JSON.parse(await this.getMeta('config') || '{}'));
		this.saveConfig(config);
	},

	async saveConfig(input) {
		config.setConfig(input);
		await this.setMeta('config', JSON.stringify(config.getConfig()));
	},

	async migrate() {
		await this.client.execute(`
			CREATE TABLE IF NOT EXISTS meta (
				id TEXT PRIMARY KEY,
				value TEXT
			)`);

		const migrationDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migration');
		const files = fs.readdirSync(migrationDir)
			.filter(f => f.endsWith('.sql'))
			.sort();

		let version = parseInt(await this.getMeta('version') || '0');
		for (const file of files) {
			const v = parseInt(file.match(/^(\d+)/)?.[0] || '0');
			if (v > version) {
				log.info({ file }, `applying migration ${file}`);
				await wait(32); // Yield to ensure log is flushed

				const sql = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
				const batch = sql.split(';').map(s => s.trim()).filter(Boolean);

				// VACUUM cannot be executed within a transaction (batch 'write' mode)
				const hasVacuum = batch.some(s => s.toUpperCase().includes('VACUUM'));
				if (hasVacuum) {
					for (const s of batch)
						await this.client.execute(s);
				} else {
					await this.client.batch(batch, 'write');
				}

				version = v;
				await this.setMeta('version', version.toString());
			}
		}
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
				`-- Full-Text Search (FTS5)
				CREATE VIRTUAL TABLE bookmark_fts USING fts5(
					title,
					memo,
					summary,
					markdown,
					url,
					tokenize="${tokenizerString}" -- ${current}
				)`,
			], 'write');

			await this.setMeta('fts_tokenizer', current);
		}
	},

	async initializeVectorTable() {
		if (config['server.readonly'])
			return;

		const enabled = config['sentence.vector.enabled'];
		const current = config['sentence.vector.model'];
		const old = await this.getMeta('vector_model');

		// Handle model change (Re-create table)
		if (enabled && old !== current) {
			const batch = ['DROP TABLE IF EXISTS bookmark_vector'];
			if (current === '') {
				log.info('initializing vector stub table');
				batch.push(`CREATE TABLE bookmark_vector (
					row_id INTEGER PRIMARY KEY AUTOINCREMENT, bookmark_id INTEGER, vector F32_BLOB(768))`);
			} else {
				// Avoid CASCADE to prevent child vector loss on REPLACE
				const dimension = await sentence.getDimension();
				log.info({ from: old, to: current, dimension }, 'model changed, re-initializing vector table');
				batch.push(
					`-- Vector Search
					CREATE TABLE bookmark_vector (
						row_id INTEGER PRIMARY KEY AUTOINCREMENT,
						bookmark_id INTEGER,
						chunk_index INTEGER,
						field TEXT,
						content TEXT,
						position INTEGER,
						vector F32_BLOB(${dimension}) -- dimension depends on the model
					)`,
					'CREATE INDEX bookmark_vector_bookmark_id_idx ON bookmark_vector (bookmark_id)');
			}
			await this.client.batch(batch, 'write');
			await this.setMeta('vector_model', current);
		}

		// Sync index state (Check actual schema discrepancy)
		const useIndex = config['database.useVectorIndex'];
		const rows = await this.execute(
			"SELECT 1 FROM sqlite_master WHERE type='index' AND name='bookmark_vector_idx'");
		const indexExists = rows.length > 0;

		if (useIndex && !indexExists) {
			log.info('creating vector index (ANN enabled)');
			await wait(32);

			await this.execute(
				`CREATE INDEX bookmark_vector_idx ON bookmark_vector (
						libsql_vector_idx(vector, 'metric=cosine', 'max_neighbors=16', 'compress_neighbors=float8'))`);
		} else if (!useIndex && indexExists) {
			log.info('dropping vector index (ANN disabled)');
			await this.execute('DROP INDEX IF EXISTS bookmark_vector_idx');
		}
	},

	async vacuum() {
		if (config['server.readonly'])
			return;

		const { page_size, page_count, freelist_count } = await this.getPragma([
			'page_size', 'page_count', 'freelist_count',
		]);
		log.debug({ page_size, page_count, freelist_count }, 'vacuum status');

		if (freelist_count === 0)
			return;

		// Optimize if waste is > 20% and > 100MB
		const wastePercent = (freelist_count / page_count) * 100;
		const wasteBytes = freelist_count * page_size;
		log.debug({ wastePercent, wasteBytes }, 'vacuum threshold check');
		if (wastePercent <= 20 || wasteBytes <= 100 * 1024 * 1024)
			return;

		await this.vacuumJob?.abort();

		log.info({
			waste: `${wastePercent.toFixed(1)}%`,
			size: `${(wasteBytes / 1024 / 1024).toFixed(1)}MB`,
		}, 'optimizing database (incremental vacuum)');

		const step = 300;
		const steps = new Array(Math.ceil(freelist_count / step)).fill(0);
		this.vacuumJob = queue.batch(steps, async () => {
			await this.execute(`PRAGMA incremental_vacuum(${step})`);
		}, { priority: -2, size: 1, interval: 500, label: 'Vacuuming' });

		this.vacuumJob.then(() => {
			this.execute('PRAGMA wal_checkpoint(TRUNCATE)');
		});
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
		const [row] = await this.execute('SELECT value FROM meta WHERE id = ?', [id]);
		return row?.value;
	},

	async setMeta(id, value) {
		await this.execute('INSERT OR REPLACE INTO meta (id, value) VALUES (?, ?)', [id, value]);
	},

	async getTotalCount() {
		const [{ count }] = await this.execute('SELECT count(*) as count FROM bookmark');
		return count;
	},

	async count({ from, where, args }) {
		const sql = `SELECT count(*) as count ${from} ${where ? `WHERE ${where}` : ''}`;
		const [{ count }] = await this.execute(sql, args);
		return count;
	},

	async execute(sql, args = []) {
		const rs = await this.client.execute(typeof sql === 'string' ? { sql, args } : sql);
		return rs.rows || [];
	},

	async getPragma(names) {
		names = Array.isArray(names) ? names : [names];
		const rs = await this.client.batch(names.map(n => `PRAGMA ${n}`), 'read');
		return rs.reduce((acc, r) => Object.assign(acc, r.rows[0]), {});
	},
};

export default database;
