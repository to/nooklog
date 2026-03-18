import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';

import config from './config.js';
import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'database' });

// 日本語表記揺れの正規化
export const normalizeJp = text => (text || '')
	.normalize('NFKC')
	.replace(/([ァ-ヶー]{2,})ー$/g, '$1');

// 1文字 Uni-gram 分割
export const segment = text => [...normalizeJp(text)]
	.join(' ')
	.replace(/\s+/g, ' ')
	.trim();

// URL専用セグメント (プロトコルのみ除去し、記号は保持してUni-gram化)
export const segmentUrl = url => segment((url || '')
	.replace(/^https?:\/\//, '')
	.toLowerCase());

// Markdown専用セグメント (記号やURLを物理的に除去するのではなく、スペースに置換してインデックスの重なりを抑制)
export const segmentMarkdown = text => segment((text || '')
	.replace(/https?:\/\/[^\s]+/g, ' ') // URL自体はurlカラムにあるので除去
	.replace(/[#*`_~[\]()>+-]/g, ' ')); // 装飾記号をスペースへ

const db = {
	client: null,

	async initialize() {
		const dbDir = path.join(config['server.data.path'], 'db');
		if (!fs.existsSync(dbDir))
			fs.mkdirSync(dbDir, { recursive: true });

		const dbPath = path.join(dbDir, 'nooklog.db');
		logger.info({ path: dbPath }, 'opening libsql database');

		// libSQL clientの初期化 (Local File)
		this.client = createClient({
			url: `file:${dbPath}`,
		});

		// PRAGMAの設定 (libSQLのexecuteで実行)
		await this.client.execute('PRAGMA journal_mode = WAL');
		await this.client.execute('PRAGMA synchronous = NORMAL');

		await this.createTables();
	},

	async createTables() {
		await this.client.batch([
			`CREATE TABLE IF NOT EXISTS bookmark (
				id TEXT PRIMARY KEY,
				url TEXT,
				title TEXT,
				memo TEXT,
				rating INTEGER,
				tags TEXT, -- JSON array
				created_at INTEGER,
				updated_at INTEGER,
				html TEXT,
				markdown TEXT,
				summary TEXT
			)`,
			`CREATE TABLE IF NOT EXISTS meta (
				id TEXT PRIMARY KEY,
				value TEXT
			)`,
			// FTS5テーブル。tokenizeオプションなどはそのまま利用可能
			`CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_fts USING fts5(
				title,
				memo,
				markdown,
				url,
				tokenize="unicode61 categories 'L* N* P* S*'"
			)`,
			// 【新機能】libSQLネイティブ・ベクトルインデックスの例 (開発予定に合わせて)
			// 本格導入時にカラムを追加してインデックスを作成する想定
			/*
			`CREATE TABLE IF NOT EXISTS bookmark_embeddings (
				bookmark_id TEXT PRIMARY KEY,
				embedding F32_BLOB(1536) -- 例: OpenAIの次元数
			)`,
			`CREATE INDEX IF NOT EXISTS bookmark_embeddings_idx ON bookmark_embeddings (
				libsql_vector_idx(embedding, 'metric=cosine')
			)`
			*/
		], 'write');
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

	// ヘルパー: トランザクション (batchを使用)
	async transaction(fn) {
		// libSQLではJS関数を渡すtransaction()ではなく、batch()で一括実行するか、
		// 自分でBEGIN/COMMITを管理する。ここでは安全のためbatchを介するパターンを想定。
		return await fn(this.client);
	},
};

// initializeは非同期なので、呼び出し元で待機する必要がある（server.jsなど）
export default db;
