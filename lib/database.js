import lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'pages';

// ダミーデータによるスキーマ定義（暫定）
// TODO: arrow.Schema を使用した定義に移行する
const TABLE_SCHEMA = {
	id: 'TABLE_SCHEMA',
	url: '',
	title: '',
	memo: '',
	rating: 0,
	ai_keywords: [''],
	keywords: [''],
	tags: [''],
	content: '',
	created_at: Date.now(),
	updated_at: Date.now(),
};

class NookmarkDatabase {
	constructor() {
		this.db = null;
		this.table = null;
	}

	async initialize() {
		if (!fs.existsSync(DB_DIR))
			fs.mkdirSync(DB_DIR, { recursive: true });

		this.db = await lancedb.connect(DB_DIR);

		const tableNames = await this.db.tableNames();
		if (!tableNames.includes(TABLE_NAME)) {
			console.log(`Creating table: ${TABLE_NAME}`);

			this.table = await this.db.createTable(TABLE_NAME, [TABLE_SCHEMA]);
			await this.table.delete('id = \'TABLE_SCHEMA\'');
		} else {
			this.table = await this.db.openTable(TABLE_NAME);
		}

		console.log('LanceDB initialized.');
		console.log(`Table "${TABLE_NAME}" has ${await this.table.countRows()} rows.`);
	}

	// SQLインジェクション対策ヘルパー
	// TODO: 本当のSQLインジェクション対策を実装する
	// TODO: パラメタライズドクエリなどがないか調査する
	_escape(str) {
		return str.replace(/'/g, '\'\'');
	}

	// LanceDBのVector型をJSの標準配列に変換する
	_sanitize(results) {
		if (results.length === 0)
			return results;

		// スキーマから配列型のカラム名を特定
		const arrayColumns = Object.keys(TABLE_SCHEMA).filter(
			key => Array.isArray(TABLE_SCHEMA[key]));

		for (const row of results) {
			for (const col of arrayColumns) {
				if (row[col] == null)
					continue;

				row[col] = row[col].toArray ?
					row[col].toArray() : Array.from(row[col]);
			}
		}
		return results;
	}

	async findByUrl(url) {
		const safeUrl = this._escape(url);
		const results = await this.table.query().where(`url = '${safeUrl}'`).limit(1).toArray();
		return this._sanitize(results)[0];
	}

	async findById(id) {
		const safeId = this._escape(id);
		const results = await this.table.query().where(`id = '${safeId}'`).limit(1).toArray();
		return this._sanitize(results)[0];
	}

	async save(record) {
		await this.table.add([record]);
	}

	async upsert(record) {
		// LanceDB simplified upsert: delete if exists and add
		const safeId = this._escape(record.id);
		await this.table.delete(`id = '${safeId}'`);
		await this.table.add([record]);
	}

	async deleteById(id) {
		const safeId = this._escape(id);
		await this.table.delete(`id = '${safeId}'`);
	}

	async getRecent(limit = 20) {
		console.log('getRecent: ', limit);
		// 全件取得してからソートしないと「最新の」データが取れないため、一時的に全件取得する
		// TODO: データ量が増えたらパフォーマンスに影響するため、LanceDBのOrderBy対応状況を確認して最適化する
		const results = await this.table.query().toArray();
		results.sort((a, b) => b.updated_at - a.updated_at);
		return this._sanitize(results.slice(0, limit));
	}

	async getAllTags() {
		// TODO: LanceDBの機能で集計できるように最適化する
		const results = await this.table.query().toArray();
		const tags = new Set();
		for (const row of results) {
			if (Array.isArray(row.tags)) {
				for (const tag of row.tags)
					tags.add(tag);

			}
		}
		return Array.from(tags).sort();
	}
}

const db = new NookmarkDatabase();
export default db;
