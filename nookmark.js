import crypto from 'crypto';
import { processHtml } from './lib/librarian.js';
import Pinboard from './lib/pinboard.js';
import db from './lib/database.js';
import _ from './lib/util.js';

const pinboard = new Pinboard();

const nookmark = {
	async initialize() {
		await db.initialize();
	},

	async getRecentPages(limit = 20) {
		return await db.getRecent(limit);
	},

	async findPageById(id) {
		return await db.findById(id);
	},

	async upsertPage({ id, url, title, memo, rating, tags, html }) {
		let page = null;
		page = id ?
			await db.findById(id) :
			await db.findByUrl(url);

		const isNew = !page;
		const now = Date.now();

		// 新規作成時の初期化
		if (isNew) {
			if (!url)
				throw new Error('URL is required for new pages');

			page = {
				id: crypto.randomUUID(),
				url: url,
				title: title || '',
				memo: '',
				rating: 0,
				ai_keywords: [],
				keywords: [],
				tags: [],
				content: '',
				created_at: now,
			};
		} else if (!memo && !rating && !tags) {
			// 既存ページの編集画面を再度開こうとしているか？
			return {
				isNew: isNew,
				page: page,
			}
		}
		page.updated_at = now;

		// HTML解析と反映
		if (html) {
			const parsed = processHtml(url, title, html);
			page.title = parsed.title; // HTML解析結果のタイトルを優先
			page.content = parsed.content;
			if (isNew)
				page.keywords = parsed.keywords || [];
			// page.ai_keywords get populated later
		}

		// データベースに保存または更新
		_.merge(page, { title, memo, rating, tags });
		await db.upsert(page);

		// Pinboard連携
		if (process.env.PINBOARD_TOKEN) {
			pinboard.add({
				url: page.url,
				description: page.title,
				extended: page.memo,
				tags: `${(rating != null) ? rating : ''} ${page.tags ? page.tags.join(' ') : ''}`,
				replace: 'yes',
			}).catch(() => { });
		} else {
			console.log(`Pinboard: skipped.\n${page.title} \n${page.url} `);
		}

		return {
			isNew: isNew,
			page: page,
		};
	},
};

export default nookmark;
