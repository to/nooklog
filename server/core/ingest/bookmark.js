import { JSDOM } from 'jsdom';

export function process(content, options = {}) {
	if (typeof content === 'string') {
		if (/<(?:!DOCTYPE|html|head|body|p|a|ul|ol|li)/i.test(content))
			return processHTML(content, options);
		return processText(content, options);
	}

	if (content.bookmarks)
		return processKarakeep(content, options);

	if (content.collections) {
		// Does Linkwarden have links directly under collections?
		// (Session Buddy has links inside folders)
		if (content.collections.some(it => it.links))
			return processLinkwarden(content, options);

		return processSessionBuddy(content, options);
	}

	if (Array.isArray(content)) {
		// nooklog
		if (content[0].markdown != null)
			return content;

		if (content[0]?.windows)
			return processTabSessionManager(content, options);

		if (content[0]?.href)
			return processPinboard(content, options);
	}

	return [];
}

export function processText(text, options = {}) {
	return text.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.startsWith('http'))
		.map(url => ({ url }));
}

export function processLinkwarden(data, options = {}) {
	const results = [];
	for (const coll of data.collections || []) {
		const collTags = options.folderTag ? [normalizeTag(coll.name)] : [];
		for (const link of coll.links || []) {
			results.push({
				url: link.url,
				title: link.name || '',
				memo: link.description || '',
				tags: [...collTags, ...(link.tags || []).map(it => normalizeTag(it.name))],
				created_at: link.createdAt ? new Date(link.createdAt).getTime() : undefined,
				updated_at: link.updatedAt ? new Date(link.updatedAt).getTime() : undefined,
			});
		}
	}
	return results;
}

export function processKarakeep(data, options = {}) {
	const results = [];
	const listMap = new Map((data.lists || []).map(it => [it.id, it.name]));

	for (const item of data.bookmarks || []) {
		const bookmark = {
			url: item.content?.url || '',
			title: item.title || '',
			memo: item.note || item.content?.text || '',
			tags: (item.tags || []).map(normalizeTag),
			created_at: item.createdAt ? item.createdAt * 1000 : undefined,
			updated_at: item.createdAt ? item.createdAt * 1000 : undefined,
		};

		if (options.folderTag) {
			for (const listId of item.lists || []) {
				const listName = listMap.get(listId);
				if (listName)
					bookmark.tags.push(normalizeTag(listName));
			}
		}

		bookmark.tags = [...new Set(bookmark.tags)];
		results.push(bookmark);
	}

	return results;
}

export function processPinboard(data, options = {}) {
	return data.map(it => ({
		url: it.href,
		title: it.description || '',
		memo: it.extended || '',
		tags: (it.tags || '').split(/\s+/).filter(Boolean),
		created_at: new Date(it.time).getTime(),
		updated_at: new Date(it.time).getTime(),
	}));
}

export function processSessionBuddy(data, options = {}) {
	const results = [];
	for (const collection of data.collections || []) {
		for (const folder of collection.folders || []) {
			const folderTags = options.folderTag ? [normalizeTag(folder.title)] : [];
			for (const link of folder.links || []) {
				results.push({
					url: link.url,
					title: link.title || '',
					tags: [...folderTags],
				});
			}
		}
	}
	return results;
}

export function processTabSessionManager(sessions, options = {}) {
	let results = [];
	for (const session of sessions) {
		for (const windowId in session.windows) {
			const window = session.windows[windowId];
			for (const tabId in window) {
				const tab = window[tabId];
				if (tab.url.startsWith('chrome') || tab.url.startsWith('about'))
					continue;
				results.push({
					url: tab.url,
					title: tab.title,
					tags: [...(session.tag || [])],
					created_at: session.date,
					updated_at: session.date,
				});
			}
		}
	}
	return results;
}

// Parse HTML and convert to bookmarks
export function processHTML(html, options = {}) {
	const dom = new JSDOM(html);
	const document = dom.window.document;
	const results = [];

	// Get all links (bookmarks)
	const anchors = document.querySelectorAll('a');

	for (const a of anchors) {
		const bookmark = {
			url: a.getAttribute('href') || '',
			title: a.textContent?.trim() || '',
			tags: [],
		};

		// Get <DD> element as memo if exists (Mosaic/Netscape format)
		const dd = a.closest('dt')?.nextElementSibling;
		if (dd?.tagName === 'DD')
			bookmark.memo = dd.textContent?.trim() || '';

		// Convert date attribute if exists (Unix timestamp expected)
		const addDate = a.getAttribute('ADD_DATE');
		if (addDate) {
			const ts = parseInt(addDate) * 1000;
			if (!isNaN(ts)) {
				bookmark.created_at = ts;
				bookmark.updated_at = ts;
			}
		}

		// Overwrite if LAST_MODIFIED attribute exists
		const lastModified = a.getAttribute('LAST_MODIFIED');
		if (lastModified) {
			const ts = parseInt(lastModified) * 1000;
			if (!isNaN(ts))
				bookmark.updated_at = ts;
		}

		// Process TAGS attribute (Firefox format)
		const inlineTags = a.getAttribute('TAGS');
		if (inlineTags) {
			const tags = inlineTags.split(',').map(normalizeTag);
			bookmark.tags.push(...tags);
		}

		// Append folder name to tags
		if (options.folderTag)
			bookmark.tags.push(...getFolderTags(a).map(normalizeTag));

		// Remove duplicate tags
		bookmark.tags = [...new Set(bookmark.tags)];

		results.push(bookmark);
	}

	return results;
}

// Normalize tags (lowercase, replace symbols with hyphen)
function normalizeTag(tag) {
	if (!tag)
		return '';
	return tag.trim().toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

// Ascend parents to get folder names
function getFolderTags(aElement) {
	const folderNames = [];
	let current = aElement;

	while (current) {
		// Find wrapping DL of current element
		const dl = current.parentElement?.closest('dl');
		if (!dl)
			break;

		// In Netscape format, H3 (folder) is inside DT right before DL
		// DT > H3 (Folder Name)
		// DL > DT > A (Bookmark)
		const prevDt = dl.previousElementSibling;
		if (prevDt) {
			const h3 = prevDt.tagName === 'H3' ? prevDt : prevDt.querySelector('h3');
			if (h3)
				folderNames.push(h3.textContent.trim());
		}

		// Move to DL parent (usually DT or BODY) and continue
		current = dl.parentElement;
	}
	return folderNames;
}
