const BASE = 'http://localhost:3000';

async function checkUrl(tabId, url) {
	// 特殊なページは除外する
	if (!url || /^(chrome|chrome-extension|about|edge):/.test(url))
		return;

	try {
		const res = await fetch(
			`${BASE}/api/bookmarks?url=${encodeURIComponent(url)}`);
		const data = await res.json();

		chrome.action.setBadgeText({
			tabId,
			text: data ? ' ' : '',
		});
		chrome.action.setBadgeBackgroundColor({
			tabId,
			color: '#82c91e',
		});
	} catch {
		chrome.action.setBadgeText({ tabId, text: '' });
	}
}

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'searchNookmark',
		title: 'Search Nookmark for "%s"',
		contexts: ['selection'],
	});
});

chrome.contextMenus.onClicked.addListener(info => {
	if (info.menuItemId === 'searchNookmark') {
		chrome.tabs.create({
			url: `${BASE}/?query=${encodeURIComponent(info.selectionText)}`,
		});
	}
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status === 'complete')
		checkUrl(tabId, tab.url);
});
