const SERVER_URL = 'http://localhost:5050';
const WINDOW_WIDTH = 500;
const WINDOW_HEIGHT = 480;
const WINDOW_MARGIN = 25;

chrome.action.onClicked.addListener(tab => openUpdatePage(tab));

chrome.commands.onCommand.addListener(async command => {
	if (command === 'open-update-page') {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		openUpdatePage(tab);
	}
});

chrome.runtime.onInstalled.addListener(() => {
	// 拡張アイコンのコンテキストメニューに常に表示されてしまう(解決方法不明)
	chrome.contextMenus.create({
		id: 'search-nookmark',
		title: 'Search Nookmark for "%s"',
		contexts: ['selection'],
	});

	cleanupHtmlStorage();
});

chrome.runtime.onStartup.addListener(() => cleanupHtmlStorage());

chrome.contextMenus.onClicked.addListener(info => {
	// 拡張アイコンをクリックされた時を除外する
	if (info.menuItemId === 'search-nookmark' && info.selectionText)
		openSearchPage(info.selectionText);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status == 'loading')
		checkUrl(tab);
});

async function openUpdatePage(contentTab) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId: contentTab.id },
			files: ['contentScript.js'],
		});
	} catch {
		// スクリプトの埋め込みが許可されないページ(chrome://や拡張ストアなど)
	}
}

async function openSearchPage(query) {
	chrome.tabs.create({
		url: `${SERVER_URL}/?query=${encodeURIComponent(query)}`,
	});
}

async function checkUrl(tab) {
	// 特殊なページは除外する
	if (!tab.url || /^(chrome|chrome-extension|devtools|about|edge):/.test(tab.url))
		return;

	try {
		// ブックマーク済みかチェックする
		const res = await fetch(
			`${SERVER_URL}/api/bookmarks?url=${encodeURIComponent(tab.url)}`);
		const data = await res.json();
		await chrome.action.setBadgeText({
			tabId: tab.id,
			text: data ? ' ' : '',
		});
		await chrome.action.setBadgeBackgroundColor({
			tabId: tab.id,
			color: '#82c91e',
		});
	} catch {
	}
}

async function getCurrentDisplay() {
	const currentWin = await chrome.windows.getCurrent();
	const centerX = currentWin.left + currentWin.width / 2;
	const displays = await chrome.system.display.getInfo();
	return displays.find(d =>
		(centerX >= d.workArea.left) && (centerX < d.workArea.left + d.workArea.width),
	) || displays[0];
}

async function cleanupHtmlStorage() {
	const items = await chrome.storage.local.get(null);
	const keys = Object.keys(items)
		.filter(k => k.startsWith('html:'));
	chrome.storage.local.remove(keys);
}
