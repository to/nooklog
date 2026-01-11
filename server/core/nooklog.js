import crypto from 'node:crypto';
import db from './database.js';
import store from './store.js';
import config from './config.js';
import vector from './sentence/vector.js';
import _ from './util.js';
import baseLog from './log.js';

let ingest;
if (!config['server.readonly'])
	ingest = (await import('./ingest/index.js')).default;

const log = baseLog.child({ module: 'nooklog' });

const stashMap = new Map();

let tagCache = null;

const USER_MARK = '\u200B';
const SECRET_MASK = '********';
const DEFAULT_COLUMNS = [
	'id', 'url', 'title', 'memo', 'summary',
	'tags', 'rating',
	'updated_at', 'created_at',
];
const DETAIL_COLUMNS = [
	...DEFAULT_COLUMNS, 'markdown',
];

const nooklog = {
	async initialize() {
		// Build tag cache
		if (!tagCache) {
			tagCache = new Set(await store.getTags());
			log.info({ count: tagCache.size }, 'tags loaded');
		}

		store.reindexFts();
		store.reembed();
	},

	async dispose() {
		log.info('disposing nooklog');
		await ingest?.browser.dispose();
		await store.dispose();
		db.close();
	},

	getConfig() {
		const res = { ...config };

		if (res['server.password'])
			res['server.password'] = SECRET_MASK;

		if (res['sentence.vector.apiKey'])
			res['sentence.vector.apiKey'] = SECRET_MASK;

		return res;
	},

	async getVectorModels(url) {
		return await vector.getModels(url);
	},

	async saveConfig(input) {
		if (config['server.readonly'])
			return config;

		const password = input['server.password'];
		if (password === SECRET_MASK) {
			delete input['server.password'];
		} else if (password) {
			const salt = crypto.randomBytes(16).toString('hex');
			const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
			input['server.password'] = `${salt}:${hash}`;
		}

		if (input['sentence.vector.apiKey'] === SECRET_MASK)
			delete input['sentence.vector.apiKey'];

		await db.saveConfig(input);

		store.reindexFts();
		store.reembed();

		return config;
	},

	async getTags() {
		return Array.from(tagCache)
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	},

	async stash(b) {
		stashMap.set(b.id || b.url, b);
	},

	async pop(b) {
		const key = b.id || b.url;
		b = stashMap.get(key) || b;
		stashMap.delete(key);

		// Initial pop?
		if (b.memo == null)
			b = { ...await this.find(b), ...b };

		if (b.html) {
			// Remove obsolete tags and update to latest HTML
			const processed = ingest.html.process(b.url, b.html);
			b.html = processed.html;

			// Update to latest Markdown if user has not edited
			if (!this.isEdited(b.markdown))
				b.markdown = processed.markdown;
		}

		return b;
	},

	async find(ps) {
		return await store.find({ ...ps, columns: DETAIL_COLUMNS });
	},

	async delete(id) {
		if (config['server.readonly'])
			return;

		const bookmark = await store.find({ id });
		await store.delete(id);

		if (bookmark)
			await this._syncTagCache(bookmark.tags, []);

		return bookmark;
	},

	async search(options = {}) {
		return await store.search({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async save({ id, url, title, memo, summary, rating, tags, html, markdown, meta, created_at, updated_at }) {
		if (config['server.readonly'])
			return await this.find({ id, url });

		if (!id && !url)
			throw new Error('Missing id or url');

		let b = await store.find({ id, url });
		const isNew = !b;
		const now = Date.now();

		if (isNew) {
			b = db.createBookmark();
			b.created_at = created_at ?? now;
		}
		b.updated_at = updated_at ?? now;

		// Keep old value for checks
		const original = { ...b };

		if (this.isEdited(markdown) || (markdown != null && !this.isEdited(b.markdown)))
			b.markdown = markdown || '';

		if (html) {
			const processed = ingest.html.process(url, html);
			b.html = processed.html;
			if (!this.isEdited(b.markdown))
				b.markdown = processed.markdown;
		}

		// If user edited to empty, weaken so it's overwritten next time form opens
		// (Special state: saved as empty but can be overwritten)
		if (b.markdown === USER_MARK)
			b.markdown = '';

		// Truncate HTML
		if (!config['database.saveHTML'])
			b.html = '';

		// Apply to DB
		_.merge(b, { url, title, memo, summary, rating, tags, meta });

		// Identify changed columns (targets for embeddings or FTS)
		const ftsColumns = ['url', 'title', 'memo', 'summary', 'markdown'];
		const embedColumns = ['title', 'summary', 'memo', 'markdown'];

		const changed = ftsColumns.filter(f => b[f] !== original[f]);
		const embedFields = changed.filter(f => embedColumns.includes(f));

		await store.save(b, {
			fts: changed.length > 0,
			embed: embedFields.length > 0,
			embedFields,
		});

		await this._syncTagCache(original.tags || [], b.tags);

		return b;
	},

	async _syncTagCache(oldTags, newTags) {
		if (config['server.readonly'])
			return;

		for (const tag of newTags)
			tagCache.add(tag);

		for (const tag of oldTags.filter(t => !newTags.includes(t))) {
			if (!await store.existsTag(tag))
				tagCache.delete(tag);
		}
	},

	async import(content, options = {}) {
		if (config['server.readonly'])
			return { count: 0 };

		const bookmarks = ingest.bookmark.process(content, options);
		const count = await store.import(bookmarks);

		// Update tag cache
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
				const [, frontmatter, body] =
					content.match(/^(?:---\s+(.*?)\s+---\s+)?(.+)$/us) || [null, null, content];
				content = [
					'---',
					frontmatter || (
						`url: ${b.url}\n` +
						`title: "${(b.title || '').replace(/"/g, '\\"')}"`),
					b.summary ? `summary: |-\n  ${b.summary.trim().replace(/\n/g, '\n  ')}` : '',
					`rating: ${b.rating || 0}`,
					`tags: [${(b.tags || []).join(', ')}]`,
					`memo: "${(b.memo || '').replace(/"/g, '\\"')}"`,
					`date: ${createdDate.toISOString()}`,
					'---',
				].filter(Boolean).join('\n') + '\n\n' + body;
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

export default nooklog;
