import path from 'path';
import lancedb, { Index } from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';

import _ from './util.js';
import baseLogger from './logger.js';
import config from './config.js';

const logger = baseLogger.child({ module: 'database' });

const LANGUAGES = {
	ar: 'Arabic', da: 'Danish', nl: 'Dutch', en: 'English',
	fi: 'Finnish', fr: 'French', de: 'German', el: 'Greek',
	hu: 'Hungarian', it: 'Italian', no: 'Norwegian', pt: 'Portuguese',
	ro: 'Romanian', ru: 'Russian', es: 'Spanish', sv: 'Swedish',
	ta: 'Tamil', tr: 'Turkish',
};

class Database {
	constructor() {
		this.db = null;
		this.bookmarks = null;
		this.meta = null;
	}

	async initialize() {
		this.db = await lancedb.connect(path.join(config['server.data.path'], 'db'));
		await this.createTables();

		this.bookmarks = await this.db.openTable('bookmarks');
		this.meta = await this.db.openTable('meta');
		logger.info({ count: await this.bookmarks.countRows() }, 'bookmarks table opened');

		await this.createIndices();
	}

	async createTables() {
		const tableNames = await this.db.tableNames();

		if (!tableNames.includes('bookmarks')) {
			logger.info('creating bookmarks table');
			await this.db.createEmptyTable('bookmarks', new arrow.Schema([
				new arrow.Field('id', new arrow.Utf8()),
				new arrow.Field('url', new arrow.Utf8()),
				new arrow.Field('title', new arrow.Utf8()),
				new arrow.Field('memo', new arrow.Utf8()),
				new arrow.Field('rating', new arrow.Int32()),
				new arrow.Field('keywords', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
				new arrow.Field('keywords_full', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
				new arrow.Field('tags', new arrow.List(new arrow.Field('item', new arrow.Utf8()))),
				new arrow.Field('created_at', new arrow.Float64()),
				new arrow.Field('updated_at', new arrow.Float64()),
				new arrow.Field('html', new arrow.Utf8()),
				new arrow.Field('markdown', new arrow.Utf8()),
				new arrow.Field('summary', new arrow.Utf8()),
			]));
		}

		if (!tableNames.includes('meta')) {
			logger.info('creating meta table');
			await this.db.createEmptyTable('meta', new arrow.Schema([
				new arrow.Field('id', new arrow.Utf8()),
				new arrow.Field('value', new arrow.Utf8()),
			]));
		}
	}

	async getMeta(id) {
		const row = (await this.meta.query()
			.where(`id = '${id.replace(/'/g, '\'\'')}'`)
			.limit(1).toArray())[0];
		return row?.value;
	}

	async setMeta(id, value) {
		await this.meta.mergeInsert('id')
			.whenMatchedUpdateAll()
			.whenNotMatchedInsertAll()
			.execute([{ id, value }]);
	}

	async createIndices() {
		// トークナイザー言語が変更されたか？
		const language = config['database.tokenizerLanguage'];
		const lastLanguage = await this.getMeta('tokenizerLanguage');
		if (lastLanguage && lastLanguage !== language) {
			// 古い全文検索インデックスを削除する
			logger.warn({ from: lastLanguage, to: language }, 'tokenizer language changed (dropping FTS indices)');
			for (const idx of await this.bookmarks.listIndices()) {
				if (idx.indexType === 'FTS')
					await this.bookmarks.dropIndex(idx.name);
			}
		}

		if (lastLanguage !== language)
			await this.setMeta('tokenizerLanguage', language);

		const existing = new Set(
			(await this.bookmarks.listIndices()).map(i => i.columns[0]));

		const fts = /^(ja|zh|ko)$/.test(language)
			? () => Index.fts({
				baseTokenizer: 'ngram',
				removeStopWords: false,
				withPosition: true,
				asciiFolding: true,
				ngramMinLength: 2,
				ngramMaxLength: 2,
			})
			: () => Index.fts({
				baseTokenizer: 'simple',
				stem: true,
				removeStopWords: true,
				language: LANGUAGES[language],
				withPosition: true,
				asciiFolding: true,
			});

		for (const [column, cfg] of [
			['id'],
			['url', fts()],
			['title', fts()],
			['memo', fts()],
			['rating', Index.bitmap()],
			['tags', Index.labelList()],
			['keywords', fts()],
			['created_at'],
			['updated_at'],
		]) {
			if (existing.has(column))
				continue;
			await this.bookmarks.createIndex(column, { config: cfg });
			logger.info({ column }, 'index created');
		}
	}

	async optimize() {
		// 断片化した小ファイルが閾値を超えたら最適化する
		const stats = await this.bookmarks.stats();
		const fragments = stats.fragmentStats.numSmallFragments;
		if (fragments < config['database.optimization.maxSmallFragments'])
			return;

		await _.bench(async () => {
			await this.bookmarks.optimize({
				cleanupOlderThan: new Date(
					Date.now() - config['database.optimization.versionRetentionDays'] * 24 * 60 * 60 * 1000),
			});
		}, `database.optimize: bookmarks(fragments: ${fragments})`);
	}
}

// カラム名が文字列変数の場合 クォートされるので注意すること
export function sql(strings, ...values) {
	return values.reduce(
		(acc, val, i) => acc + sqlValue(val) + strings[i + 1], strings[0]);
}

function sqlValue(val) {
	if (val === undefined || val === null)
		return 'NULL';

	if (typeof val === 'string')
		return `'${val.replace(/'/g, '\'\'')}'`;

	if (Array.isArray(val))
		return `[${val.map(sqlValue).join(', ')}]`;

	return val;
}

// LanceDBのVector型をJSの標準配列に変換する
// (Vector型はaddできない/v0.27)
export function populate(results) {
	if (results.length === 0)
		return results;

	const arrayColumns = Object.keys(results[0])
		.filter(key => results[0][key]?.toArray);

	for (const row of results) {
		for (const col of arrayColumns)
			row[col] = row[col].toArray();
	}
	return results;
}

const db = new Database();
await db.initialize();
export default db;
