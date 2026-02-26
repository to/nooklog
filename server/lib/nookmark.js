import crypto from 'crypto';
import { processHtml } from './librarian.js';
import db from './database.js';
import config from './config.js';
import _ from './util.js';

let tagCache = new Set();

const DEFAULT_COLUMNS = [
	'id', 'url', 'title', 'memo',
	'tags', 'rating',
	'updated_at', 'created_at',
];

const DETAIL_COLUMNS = [
	...DEFAULT_COLUMNS, 'markdown',
];

const nookmark = {
	async initialize() {
		await db.initialize();
		(await db.getTags()).forEach(t => tagCache.add(t));
		console.log(`tagCache: ${tagCache.size} tags.`);
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
		return await db.getRecent({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async findById(id) {
		return await db.findById(id, { columns: DETAIL_COLUMNS });
	},

	async findByUrl(url) {
		return await db.findByUrl(url, { columns: DETAIL_COLUMNS });
	},

	async deleteById(id) {
		const bookmark = await db.findById(id);
		await db.deleteById(id);

		if (bookmark)
			this._syncTagCache(bookmark.tags, []);
	},

	async search(options = {}) {
		return await db.search({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async upsert({ id, url, title, memo, rating, tags, html }) {
		let bookmark = id ?
			await db.findById(id) :
			await db.findByUrl(url);

		const oldTags = bookmark?.tags || [];
		const isNew = !bookmark;
		const now = Date.now();

		// 新規作成時の初期化
		if (isNew) {
			if (!url)
				throw new Error('URL is required for new pages');

			bookmark = {
				id: crypto.randomUUID(),
				url: '',
				title: '',
				memo: '',
				rating: 0,
				keywords: [],
				keywords_full: [],
				tags: [],
				created_at: now,
			};
		} else if (!memo && !rating && !tags) {
			return {
				isNew: isNew,
				bookmark: bookmark,
			};
		}
		bookmark.updated_at = now;

		if (html) {
			const parsed = processHtml(url, title, html);
			bookmark.title = parsed.title;
			if (isNew)
				bookmark.keywords = parsed.keywords || [];

			bookmark.html = parsed.cleanHtml;
			bookmark.markdown = parsed.markdown;
		}

		// データベースに保存または更新
		_.merge(bookmark, { url, title, memo, rating, tags });
		await db.upsert(bookmark);

		this._syncTagCache(oldTags, bookmark.tags);

		return {
			isNew: isNew,
			bookmark: bookmark,
		};
	},

	async _syncTagCache(oldTags, newTags) {
		for (const tag of newTags)
			tagCache.add(tag);

		for (const tag of oldTags.filter(t => !newTags.includes(t))) {
			if (!await db.existsTag(tag))
				tagCache.delete(tag);
		}
	},
};

export default nookmark;
