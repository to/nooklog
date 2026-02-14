const API = 'http://localhost:3000/api/bookmarks';

async function checkUrl(tabId, url) {
	// 特殊なページは除外する
	if (!url || /^(chrome|chrome-extension|about|edge):/.test(url))
		return;

	try {
		const res = await fetch(
			`${API}?url=${encodeURIComponent(url)}`);
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

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status === 'complete')
		checkUrl(tabId, tab.url);
});
