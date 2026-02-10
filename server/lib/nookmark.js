import crypto from 'crypto';
import { processHtml } from './librarian.js';
import db from './database.js';
import _ from './util.js';

let tagCache = new Set();

const nookmark = {
	async initialize() {
		await db.initialize();
		(await db.getTags()).forEach(t => tagCache.add(t));
		console.log(`tagCache: ${tagCache.size} tags.`);
	},

	getTags() {
		return Array.from(tagCache)
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	},

	async getRecent(options) {
		return await db.getRecent(options);
	},

	async getDump(limit) {
		return await db.getDump(limit);
	},

	async findById(id) {
		return await db.findById(id);
	},

	async findByUrl(url) {
		return await db.findByUrl(url);
	},

	async deleteById(id) {
		const bm = await db.findById(id);
		await db.deleteById(id);

		if (bm)
			this._syncTagCache(bm.tags, []);
	},

	async search(options) {
		return await db.search(options);
	},

	async upsert({ id, url, title, memo, rating, tags, html }) {
		let bm = id ?
			await db.findById(id) :
			await db.findByUrl(url);

		const oldTags = bm?.tags || [];
		const isNew = !bm;
		const now = Date.now();

		// 新規作成時の初期化
		if (isNew) {
			if (!url)
				throw new Error('URL is required for new pages');

			bm = {
				id: crypto.randomUUID(),
				url: url,
				title: title || '',
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
				bookmark: bm,
			};
		}
		bm.updated_at = now;

		let content = null;
		if (html) {
			const parsed = processHtml(url, title, html);
			bm.title = parsed.title;
			if (isNew)
				bm.keywords = parsed.keywords || [];

			content = {
				id: bm.id,
				html: parsed.cleanHtml,
				markdown: parsed.markdown,
			};
		}

		// データベースに保存または更新
		_.merge(bm, { url, title, memo, rating, tags });
		await db.upsert(bm, content);

		this._syncTagCache(oldTags, bm.tags);

		return {
			isNew: isNew,
			bookmark: bm,
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
