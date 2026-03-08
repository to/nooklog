import { processHtml } from './librarian.js';
import db from './database.js';
import store from './store.js';
import config from './config.js';
import _ from './util.js';
import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'nooklog' });

let tagCache = new Set();

const USER_MARK = '\u200B';
const DEFAULT_COLUMNS = [
	'id', 'url', 'title', 'memo',
	'tags', 'rating',
	'updated_at', 'created_at',
];
const DETAIL_COLUMNS = [
	...DEFAULT_COLUMNS, 'markdown',
];

const nooklog = {
	async initialize() {
		(await store.getTags()).forEach(t => tagCache.add(t));
		logger.info({ count: tagCache.size }, 'tags loaded');
	},

	getConfig() {
		return config;
	},

	saveConfig(values) {
		config.save(values);
	},

	getTags() {
		return Array.from(tagCache)
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	},

	async getRecent(options = {}) {
		return await store.getRecent({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async findById(id) {
		return await store.findById(id, { columns: DETAIL_COLUMNS });
	},

	async findByUrl(url) {
		return await store.findByUrl(url, { columns: DETAIL_COLUMNS });
	},

	async deleteById(id) {
		const bookmark = await store.findById(id);
		await store.deleteById(id);

		if (bookmark)
			this._syncTagCache(bookmark.tags, []);
	},

	async search(options = {}) {
		return await store.search({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async upsert({ id, url, title, memo, rating, tags, html, markdown }) {
		let bookmark = id ?
			await store.findById(id) :
			await store.findByUrl(url);

		const oldTags = bookmark?.tags || [];
		const isNew = !bookmark;

		if (isNew)
			bookmark = db.createBookmark();
		else
			bookmark.updated_at = Date.now();

		if (html && !bookmark.markdown.endsWith(USER_MARK))
			Object.assign(bookmark, processHtml(url, title, html));
		else
			bookmark.markdown = markdown || '';

		// HTMLを切り捨てる
		if (!config['database.saveHTML'])
			bookmark.html = '';

		// データベースに保存または更新
		_.merge(bookmark, { url, title, memo, rating, tags });
		await store.upsert(bookmark);

		this._syncTagCache(oldTags, bookmark.tags);

		return bookmark;
	},

	async _syncTagCache(oldTags, newTags) {
		for (const tag of newTags)
			tagCache.add(tag);

		for (const tag of oldTags.filter(t => !newTags.includes(t))) {
			if (!await store.existsTag(tag))
				tagCache.delete(tag);
		}
	},
};

await nooklog.initialize();
export default nooklog;
