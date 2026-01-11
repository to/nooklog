import lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'data', 'lancedb');
const TABLE_NAME = 'pages';
let db = null;
let pageTable = null;

export async function initialize() {
	if (!fs.existsSync(DB_DIR))
		fs.mkdirSync(DB_DIR, { recursive: true });

	db = await lancedb.connect(DB_DIR);

	const tableNames = await db.tableNames();
	if (!tableNames.includes(TABLE_NAME)) {
		console.log(`Creating table: ${TABLE_NAME}`);

		// スキーマ定義用のダミーレコードを作成し、即座に削除
		const schema_sample = [{
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

		pageTable = await db.createTable(TABLE_NAME, schema_sample);
		await pageTable.delete('id = \'schema_def\'');
	} else
		pageTable = await db.openTable(TABLE_NAME);

	console.log('LanceDB initialized.');

	console.log(`Table "${TABLE_NAME}" has ${await pageTable.countRows()} rows.`);
}

export async function findPageByUrl(url) {
	// SQLインジェクション対策: シングルクォートをエスケープ
	const safeUrl = url.replace(/'/g, '\'\'');
	const results = await pageTable.query().where(`url = '${safeUrl}'`).limit(1).toArray();
	return results.length > 0 ? results[0] : null;
}

export async function savePage(record) {
	await pageTable.add([record]);
}

export async function getRecentPages(limit = 20) {
	const results = await pageTable.query().limit(limit).toArray();
	results.sort((a, b) => b.created_at - a.created_at);
	return results;
}
