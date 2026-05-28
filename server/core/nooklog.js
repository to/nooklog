import crypto from 'node:crypto';
import db from './database.js';
import store from './store.js';
import config from './config.js';
import vector from './sentence/vector.js';
import _ from './util.js';
import baseLog from './log.js';
import queue from './queue.js';

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
	...DEFAULT_COLUMNS, 'markdown', 'meta',
];

const nooklog = {
	async initialize() {
		// Build tag cache
		if (!tagCache) {
			tagCache = new Map((await store.getTags()).map(r => [r.tag, r.count]));
			log.info({ count: tagCache.size }, 'tags loaded');
		}

		store.reindexFts();
		store.reembed();

		// Delay vacuum to avoid contention with initial indexing tasks
		setTimeout(() => db.vacuum(), 1000);
	},

	async dispose() {
		log.info('disposing resources...');

		await db.dispose();
		await _.cutOff(queue.clear(), 1000);

		// Browser cleanup is handled by the OS on exit
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

		// Run heavy maintenance tasks only during full config updates (e.g. from UI settings)
		// to avoid overhead on minor, individual setting changes (like UI tint or API keys)
		if (Object.keys(input).length > 3) {
			db.vacuum();

			store.reindexFts();
			store.reembed();
		}

		return config;
	},

	async generateApiKey() {
		const key = crypto.randomBytes(32).toString('hex');
		return await this.saveConfig({ 'server.apiKey': key });
	},

	async getTags() {
		return Array.from(tagCache.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(e => e[0]);
	},

	async stash(b) {
		stashMap.set(b.url, b);
	},

	async pop(b) {
		b = stashMap.get(b.url) || b;
		stashMap.delete(b.url);

		// Initial pop?
		if (b.memo == null)
			b = { ...await this.find(b), ...b };

		return await this._fillMarkdown(b);
	},

	async find(ps) {
		return await store.find({ ...ps, columns: DETAIL_COLUMNS });
	},

	async delete(id) {
		if (config['server.readonly'])
			return null;

		const bookmark = await store.find({ id });
		if (!bookmark)
			return null;

		await store.delete(id);
		await this._syncTagCache(bookmark.tags, []);

		return bookmark;
	},

	async search(options = {}) {
		return await store.search({
			columns: DEFAULT_COLUMNS,
			...options,
		});
	},

	async save(n) {
		if (config['server.readonly'])
			return await this.find(n);

		if (!n.id && !n.url)
			throw new Error('Missing id or url');

		let b = await store.find(n);
		const isNew = !b;
		const now = Date.now();

		if (isNew) {
			b = db.createBookmark();
			b.id = n.id || b.id;
			b.created_at = n.created_at ?? now;
		}
		b.updated_at = n.updated_at ?? now;

		const original = { ...b };

		// Prioritize user-edited data
		n.markdown = (this.isEdited(b.markdown) || !n.markdown)
			? b.markdown
			: n.markdown;

		_.merge(b, _.omit(n, ['id']));

		await this._fillHTML(b);
		await this._fillMarkdown(b);

		// If we now have both title and markdown, it's no longer in an error state
		if (b.title && b.markdown) {
			delete b.meta.fetch_error;
			delete b.meta.archive_error;
		}

		if (b.markdown === USER_MARK)
			b.markdown = '';

		if (!config['ingest.saveHTML'])
			b.html = '';

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

	async backfillContent({ limit = 100, force = false } = {}) {
		// Fetch only IDs to save memory
		const targets = await store.getBackfillContentTargets({ limit, force });
		if (targets.length === 0)
			return { count: 0 };

		log.info({ count: targets.length, force }, 'backfilling content');

		queue.batch('Backfilling content', async ([target]) => {
			const b = await store.find({ id: target.id });
			if (!b)
				return;

			try {
				await this._fillHTML(b, { force });

				// Default to missing content; save() will clear it on success
				b.meta.fetch_error = 'missing_content';

				await this.save(b);
			} catch (e) {
				// Continue to next target if it was a transient error (already handled in _fillHTML)
				if (!e.isTransient)
					throw e;
			}
		}, targets, { size: 1, interval: 2 * 1000, priority: 1, mode: 'replace' });

		return { count: targets.length };
	},

	// Fill content by crawling the URL
	async _fillHTML(b, { force = false } = {}) {
		// Fetch content if missing or forced, provided there's no existing error
		if (((!b.html && !b.markdown) || !b.title) && b.url && (!b.meta.fetch_error || force)) {
			try {
				// Fetch content and handle potential redirects
				const res = await ingest.browser.fetch(b.url);
				if (res.url && res.url !== b.url) {
					b.meta.final_url = res.url;

					if (ingest.html.isLogin(res.html, res.title, b.title)) {
						b.meta.fetch_error = 'login_required';
						log.info({ url: b.url, redirect: res.url }, 'fetch skipped: login required');
						return b;
					}
				}

				b.html = res.html;
				b.title = b.title || res.title;

				log.info({ url: b.url }, 'fetch success');
			} catch (e) {
				// Transient network issues: throw to allow backfill to retry later
				if (e.isTransient) {
					log.info({ cause: (e.archiveError || e).message, url: b.url }, `fetch transient error (skip)`);
					throw e;
				}

				if (e.archiveError)
					b.meta.archive_error = e.archiveError.message;
				b.meta.fetch_error = e.message;

				log.warn({ cause: e.message, url: b.url }, 'fetch failed');
			}
		}

		return b;
	},

	// Process HTML into Markdown
	async _fillMarkdown(b) {
		if (b.html) {
			const res = await ingest.html.process(b.url, b.html);
			b.html = res.html;

			if (!this.isEdited(b.markdown))
				b.markdown = res.markdown;
		}

		return b;
	},

	async import(content, options = {}) {
		if (config['server.readonly'])
			return { count: 0 };

		const bookmarks = ingest.bookmark.process(content, options);
		const count = await store.import(bookmarks);

		// Trigger backfill to fetch content for imports that only contain URLs
		const emptyCount = bookmarks.filter(b => !b.title).length;
		if (emptyCount > 0)
			this.backfillContent({ limit: emptyCount });

		// Update tag cache
		tagCache = new Map((await store.getTags()).map(r => [r.tag, r.count]));

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

	async _syncTagCache(oldTags, newTags) {
		if (config['server.readonly'])
			return;

		for (const tag of newTags)
			tagCache.set(tag, (tagCache.get(tag) || 0) + 1);

		for (const tag of oldTags) {
			const count = (tagCache.get(tag) || 1) - 1;
			if (count <= 0)
				tagCache.delete(tag);
			else
				tagCache.set(tag, count);
		}
	},

	isEdited(markdown) {
		return markdown && markdown.endsWith(USER_MARK);
	},
};

export default nooklog;
