import ingest from './ingest/index.js';
import db from './database.js';
import store from './store.js';
import config from './config.js';
import _ from './util.js';
import baseLog from './log.js';

const log = baseLog.child({ module: 'nooklog' });

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
		// データベースの初期化をここで行う
		await db.initialize();

		// タグキャッシュの構築
		const tags = await store.getTags();
		tags.forEach(t => tagCache.add(t));
		log.info({ count: tagCache.size }, 'tags loaded');
	},

	getConfig() {
		return config;
	},

	saveConfig(values) {
		config.save(values);
	},

	async getTags() {
		return Array.from(tagCache)
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	},

	async find(ps) {
		return await store.find({ ...ps, columns: DETAIL_COLUMNS });
	},

	async delete(id) {
		const bookmark = await store.find({ id });
		await store.delete(id);

		if (bookmark)
			await this._syncTagCache(bookmark.tags, []);
	},

	async search(options = {}) {
		return await store.search({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async save({ id, url, title, memo, rating, tags, html, markdown }) {
		let bookmark = await store.find({ id, url });

		const oldTags = bookmark?.tags || [];
		const isNew = !bookmark;

		if (isNew)
			bookmark = db.createBookmark();
		else
			bookmark.updated_at = Date.now();

		if (this.isEdited(markdown) || !this.isEdited(bookmark.markdown))
			bookmark.markdown = markdown || '';

		if (html) {
			const processed = ingest.html.process(url, title, html);
			bookmark.html = processed.html;
			if (!this.isEdited(bookmark.markdown))
				bookmark.markdown = processed.markdown;
		}

		// ユーザーが空へ編集した場合 次回 フォームを開いた際に上書きするように弱める
		// (空で保存するが上書きもされる特殊な状態)
		if (bookmark.markdown === USER_MARK)
			bookmark.markdown = '';

		// HTMLを切り捨てる
		if (!config['database.saveHTML'])
			bookmark.html = '';

		// データベースに保存または更新
		_.merge(bookmark, { url, title, memo, rating, tags });
		await store.save(bookmark);

		await this._syncTagCache(oldTags, bookmark.tags);

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

	async import(content, options = {}) {
		const bookmarks = ingest.bookmark.process(content, options);
		const count = await store.import(bookmarks);

		// タグキャッシュを更新する
		const tags = await store.getTags();
		tags.forEach(t => tagCache.add(t));

		return { count };
	},

	async exportObject(options = {}) {
		const { bookmarks } = await store.search({
			columns: DETAIL_COLUMNS,
			...options,
			limit: store.UNLIMITED,
		});
		return bookmarks;
	},

	async exportHTML(options = {}) {
		const { bookmarks } = await store.search({
			columns: DEFAULT_COLUMNS,
			...options,
			limit: store.UNLIMITED,
		});
		const escape = s => (s || '').replace(/[&<>"']/g, c => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			'\'': '&#39;',
		}[c]));

		let lines = [
			'<!DOCTYPE NETSCAPE-Bookmark-file-1>',
			'<!-- This is an automatically generated file. -->',
			'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
			'<TITLE>Bookmarks</TITLE>',
			'<H1>Bookmarks</H1>',
			'<DL><p>',
		];

		for (const b of bookmarks) {
			const date = Math.floor((b.created_at || Date.now()) / 1000);
			const tags = (b.tags || []).join(',');
			const title = escape(b.title || b.url);
			const url = escape(b.url);
			const memo = escape(b.memo);

			lines.push(`\t<DT><A HREF="${url}" ADD_DATE="${date}" LAST_MODIFIED="${date}" TAGS="${tags}">${title}</A>`);
			if (memo)
				lines.push(`\t<DD>${memo}`);
		}

		lines.push('</DL><p>');
		return lines.join('\n');
	},

	_normalizeFilename(...parts) {
		const name = parts
			.map(p => (p || '').replace(/[\/\\?%*:|"<> \s_-]+/g, '_'))
			.join('-')
			.replace(/^-+|-+$/g, '')
			.replace(/\.+$/, '');

		return name.slice(0, 200) || 'bookmark';
	},

	async exportMarkdown(archive, options = {}) {
		const { bookmarks } = await store.search({
			columns: DETAIL_COLUMNS,
			...options,
			limit: store.UNLIMITED,
		});

		const names = new Map();
		const entries = [];
		for (const b of bookmarks) {
			if (!b.markdown)
				continue;

			const createdDate = new Date(b.created_at || Date.now());

			let host = 'others';
			try {
				host = new URL(b.url).hostname || 'others';
			} catch (_) { }

			const name = this._normalizeFilename(host, b.title);
			const n = names.get(name) || 0;
			names.set(name, n + 1);

			let entryName = `${name}${n > 0 ? `_${n}` : ''}.md`;
			if (options.exportStructure === 'folders')
				entryName = `${this._normalizeFilename(host)}/${entryName}`;

			entries.push({ host, link: `- [${b.title || 'Untitled'}](${entryName})` });

			let content = b.markdown;
			if (options.exportMeta === 'full') {
				const [, frontmatter, body] = content.match(/^(?:---\s+(.*?)\s+---\s+)?(.+)$/us) || [null, null, content];
				content = [
					'---',
					frontmatter || (
						`url: ${b.url}\n` +
						`title: "${(b.title || '').replace(/"/g, '\\"')}"`),
					`rating: ${b.rating || 0}`,
					`tags: [${(b.tags || []).join(', ')}]`,
					`memo: "${(b.memo || '').replace(/"/g, '\\"')}"`,
					`date: ${createdDate.toISOString()}`,
					'---',
				].join('\n') + '\n\n' + body;
			}

			archive.append(content, {
				name: entryName,
				date: createdDate,
			});
		}

		archive.append('# Bookmarks\n\n' + Array.from(_.groupBy(entries, e => e.host))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([host, items]) => `## ${host}\n\n${items.map(i => i.link).join('\n')}`)
			.join('\n\n'), {
			name: '!index.md',
		});

		await archive.finalize();
	},

	isEdited(markdown) {
		return markdown && markdown.endsWith(USER_MARK);
	},
};

// initializeは非同期だがトップレベルawaitで解決する
await nooklog.initialize();
export default nooklog;
