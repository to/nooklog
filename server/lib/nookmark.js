import crypto from 'crypto';
import { processHtml } from './librarian.js';
import db from './database.js';
import _ from './util.js';

const nookmark = {
	async initialize() {
		await db.initialize();
	},

	async getRecent(limit) {
		return await db.getRecent(limit);
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
		await db.deleteById(id);
	},

	async search(options) {
		return await db.search(options);
	},

	async upsert({ id, url, title, memo, rating, tags, html }) {
		let bm = null;
		bm = id ?
			await db.findById(id) :
			await db.findByUrl(url);

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

		return {
			isNew: isNew,
			bookmark: bm,
		};
	},
};

export default nookmark;
