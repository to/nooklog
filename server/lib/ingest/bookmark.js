import { JSDOM } from 'jsdom';

export function process(content, options = {}) {
	if (typeof content === 'string')
		return processHTML(content, options);

	if (content.collections)
		return processSessionBuddy(content, options);

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

// PinboardのJSONをブックマークに変換する
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

// Session BuddyのJSONをブックマークに変換する
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

// Tab Session ManagerのJSONをブックマークに変換する
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

// HTMLをパースしてブックマークに変換する
export function processHTML(html, options = {}) {
	const dom = new JSDOM(html);
	const document = dom.window.document;
	const results = [];

	// 全てのリンク（ブックマーク）を取得
	const anchors = document.querySelectorAll('a');

	for (const a of anchors) {
		const bookmark = {
			url: a.getAttribute('href') || '',
			title: a.textContent?.trim() || '',
			tags: [],
		};

		// <DD>要素があればメモとして取得（Mosaic/Netscape形式）
		const dd = a.closest('dt')?.nextElementSibling;
		if (dd?.tagName === 'DD')
			bookmark.memo = dd.textContent?.trim() || '';

		// 日付属性があれば変換（Unixタイムスタンプ想定）
		const addDate = a.getAttribute('ADD_DATE');
		if (addDate) {
			const ts = parseInt(addDate) * 1000;
			if (!isNaN(ts)) {
				bookmark.created_at = ts;
				bookmark.updated_at = ts;
			}
		}

		// LAST_MODIFIED 属性があれば上書き
		const lastModified = a.getAttribute('LAST_MODIFIED');
		if (lastModified) {
			const ts = parseInt(lastModified) * 1000;
			if (!isNaN(ts))
				bookmark.updated_at = ts;
		}

		// Firefox形式の TAGS 属性を処理
		const inlineTags = a.getAttribute('TAGS');
		if (inlineTags) {
			const tags = inlineTags.split(',').map(normalizeTag);
			bookmark.tags.push(...tags);
		}

		// フォルダ名をタグに追加する
		if (options.folderTag)
			bookmark.tags.push(...getFolderTags(a).map(normalizeTag));

		// 重複タグの削除
		bookmark.tags = [...new Set(bookmark.tags)];

		results.push(bookmark);
	}

	return results;
}

// タグの正規化（小文字化、記号のハイフン置換）
function normalizeTag(tag) {
	if (!tag)
		return '';
	return tag.trim().toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

// 親要素を遡ってフォルダ名を取得する
function getFolderTags(aElement) {
	const folderNames = [];
	let current = aElement;

	while (current) {
		// 現在の要素を包んでいる DL を探す
		const dl = current.parentElement?.closest('dl');
		if (!dl)
			break;

		// Netscape形式では、DLの直前のDTの中にH3（フォルダ名）がある
		// DT > H3 (Folder Name)
		// DL > DT > A (Bookmark)
		const prevDt = dl.previousElementSibling;
		if (prevDt) {
			const h3 = prevDt.tagName === 'H3' ? prevDt : prevDt.querySelector('h3');
			if (h3)
				folderNames.push(h3.textContent.trim());
		}

		// DLの親（通常はDTかBODY）に移動してループを続ける
		current = dl.parentElement;
	}
	return folderNames;
}
