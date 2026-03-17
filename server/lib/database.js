import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

import config from './config.js';
import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'database' });

// 日本語表記揺れの正規化
export const normalizeJp = text => (text || '')
	.normalize('NFKC')
	.replace(/([ァ-ヶー]{2,})ー$/g, '$1');

// 1文字 Uni-gram 分割
const segment = text => [...normalizeJp(text)]
	.join(' ')
	.replace(/\s+/g, ' ')
	.trim();

// URL専用セグメント (プロトコルのみ除去し、記号は保持してUni-gram化)
const segmentUrl = url => segment((url || '')
	.replace(/^https?:\/\//, '')
	.toLowerCase());

// Markdown専用セグメント (記号やURLを物理的に除去するのではなく、スペースに置換してインデックスの重なりを抑制)
const segmentMarkdown = text => segment((text || '')
	.replace(/https?:\/\/[^\s]+/g, ' ') // URL自体はurlカラムにあるので除去
	.replace(/[#*`_~[\]()>+-]/g, ' ')); // 装飾記号をスペースへ

const db = {
	sqlite: null,

	initialize() {
		const dbDir = path.join(config['server.data.path'], 'db');
		if (!fs.existsSync(dbDir))
			fs.mkdirSync(dbDir, { recursive: true });

		const dbPath = path.join(dbDir, 'nooklog.db');
		logger.info({ path: dbPath }, 'opening sqlite database');
		this.sqlite = new Database(dbPath);
		this.sqlite.pragma('journal_mode = WAL');
		this.sqlite.pragma('synchronous = NORMAL');

		this.registerFunctions();
		this.createTables();
		this.createTriggers();
	},

	registerFunctions() {
		this.sqlite.function('segment', text => segment(text));
		this.sqlite.function('segment_url', url => segmentUrl(url));
		this.sqlite.function('segment_markdown', text => segmentMarkdown(text));
	},

	createTables() {
		this.sqlite.exec(`
			CREATE TABLE IF NOT EXISTS bookmark (
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
			);

			CREATE TABLE IF NOT EXISTS meta (
				id TEXT PRIMARY KEY,
				value TEXT
			);

			CREATE VIRTUAL TABLE IF NOT EXISTS bookmark_fts USING fts5(
				title,
				memo,
				markdown,
				url,
				tokenize="unicode61 categories 'L* N* P* S*'"
			);
		`);
	},

	createTriggers() {
		this.sqlite.exec(`
			DROP TRIGGER IF EXISTS bookmark_ai;
			DROP TRIGGER IF EXISTS bookmark_ad;
			DROP TRIGGER IF EXISTS bookmark_au;

			CREATE TRIGGER bookmark_ai AFTER INSERT ON bookmark BEGIN
				INSERT INTO bookmark_fts(rowid, title, memo, markdown, url)
				VALUES (
					new.rowid,
					segment(new.title),
					segment(new.memo),
					segment_markdown(new.markdown),
					segment_url(new.url)
				);
			END;

			CREATE TRIGGER bookmark_ad AFTER DELETE ON bookmark BEGIN
				DELETE FROM bookmark_fts WHERE rowid = old.rowid;
			END;

			CREATE TRIGGER bookmark_au AFTER UPDATE ON bookmark BEGIN
				DELETE FROM bookmark_fts WHERE rowid = old.rowid;
				INSERT INTO bookmark_fts(rowid, title, memo, markdown, url)
				VALUES (
					new.rowid,
					segment(new.title),
					segment(new.memo),
					segment_markdown(new.markdown),
					segment_url(new.url)
				);
			END;
		`);
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

	getMeta(id) {
		const row = this.prepare('SELECT value FROM meta WHERE id = ?').get(id);
		return row?.value;
	},

	setMeta(id, value) {
		this.prepare('INSERT OR REPLACE INTO meta (id, value) VALUES (?, ?)').run(id, value);
	},

	getTotalCount() {
		return this.prepare('SELECT count(*) as count FROM bookmark').get().count;
	},

	prepare(sql) {
		return this.sqlite.prepare(sql);
	},

	transaction(fn) {
		return this.sqlite.transaction(fn)();
	},
};

db.initialize();
export default db;
