import crypto from 'crypto';
import { processHtml } from './lib/librarian.js';
import Pinboard from './lib/pinboard.js';
import db from './lib/database.js';

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

	async upsertPage({ id, url, title, memo, tags, html }) {
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
				rating: 3,
				ai_keywords: [],
				keywords: [],
				tags: [],
				content: '',
				created_at: now,
			};
		}
		page.updated_at = now;

		// HTML解析と反映 (HTMLが渡された場合)
		if (html) {
			const parsed = processHtml(url, title, html);
			page.title = parsed.title; // HTML解析結果のタイトルを優先
			page.content = parsed.content;
			if (isNew)
				page.keywords = parsed.keywords || [];
			// page.ai_keywords get populated later

		}

		// メタデータの更新 (明示的に渡された値で上書き)
		// undefinedチェックを使うことで、空文字""による更新を許可する
		if (title !== undefined)
			page.title = title;
		if (memo !== undefined)
			page.memo = memo;
		if (tags !== undefined) {
			// 文字列なら配列に変換、配列ならそのまま
			page.tags = Array.isArray(tags) ? tags : tags.split(' ').filter(t => t.trim() !== '');
		}

		// DBに保存 (Upsert)
		await db.upsert(page);

		// Pinboard連携 (常に送る)
		if (process.env.PINBOARD_TOKEN) {
			pinboard.add({
				url: page.url,
				description: page.title,
				extended: page.memo,
				tags: Array.isArray(page.tags) ? page.tags.join(' ') : page.tags,
				replace: 'yes',
			}).catch(() => { });
		} else {
			console.log(`Pinboard: skipped.\n${page.title}\n${page.url}`);
		}

		return {
			success: true,
			id: page.id,
			isNew: isNew,
			page: page,
		};
	},
};

export default nookmark;
