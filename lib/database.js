import lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'pages';

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

			// スキーマ定義用のダミーレコードを作成し、即座に削除
			const schemaSample = [{
				id: 'schema_def',
				url: 'http://schema.def',
				title: 'Schema Definition',
				memo: '',
				rating: 3,
				ai_keywords: ['dummy'],
				keywords: ['dummy'],
				tags: ['dummy'],
				content: '',
				created_at: Date.now(),
				updated_at: Date.now(),
			}];

			this.table = await this.db.createTable(TABLE_NAME, schemaSample);
			await this.table.delete('id = \'schema_def\'');
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

	async findByUrl(url) {
		const safeUrl = this._escape(url);
		const results = await this.table.query().where(`url = '${safeUrl}'`).limit(1).toArray();
		return results.length > 0 ? results[0] : null;
	}

	async findById(id) {
		const safeId = this._escape(id);
		const results = await this.table.query().where(`id = '${safeId}'`).limit(1).toArray();
		return results.length > 0 ? results[0] : null;
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

	async getRecent(limit = 20) {
		console.log('getRecent: ', limit);
		const results = await this.table.query().limit(limit).toArray();
		console.log(results);
		results.sort((a, b) => b.created_at - a.created_at);
		return results;
	}
}

const db = new NookmarkDatabase();
export default db;
