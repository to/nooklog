const SERVER_URL = 'http://localhost:3000';
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
	chrome.contextMenus.create({
		id: 'search-nookmark',
		title: 'Search Nookmark for "%s"',
		contexts: ['selection'],
	});
});

chrome.contextMenus.onClicked.addListener(info => {
	if (info.menuItemId === 'search-nookmark')
		openSearchPage(info.selectionText);
});

chrome.tabs.onUpdated.addListener((info, tab) => {
	if (info.status === 'complete')
		checkUrl(tab);
});

async function openUpdatePage(contentTab) {
	// 更新ページを開く
	const display = await getCurrentDisplay();
	const area = display.workArea;
	const updateWin = await chrome.windows.create({
		url: 'public/update.html'
			+ `?url=${encodeURIComponent(contentTab.url)}`
			+ `&title=${encodeURIComponent(contentTab.title)}`
			+ `&contentTabId=${contentTab.id}`,
		type: 'popup',
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		left: area.left + area.width - WINDOW_WIDTH - (WINDOW_MARGIN + 10),
		top: area.top + area.height - (WINDOW_HEIGHT - 20) - WINDOW_MARGIN,
	});

	const updateTabId = updateWin.tabs[0].id;
	chrome.runtime.onMessage.addListener(function listener(msg, sender) {
		// 更新ページの準備ができてからHTMLを送信する
		if (msg.status === 'ready' && sender?.tab?.id === updateTabId) {
			chrome.runtime.onMessage.removeListener(listener);

			chrome.scripting.executeScript({
				target: { tabId: contentTab.id },
				func: contentScript,
			});
		}
	});
}

function contentScript() {
	// 対象ページのHTMLを送信する
	chrome.runtime.sendMessage({
		html: document.documentElement.outerHTML,
	});

	// テキスト選択を監視する
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection)
			chrome.runtime.sendMessage({ selection });
	});
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
