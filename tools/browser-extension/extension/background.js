const BASE = 'http://localhost:3000';
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
	if (info.menuItemId === 'search-nookmark') {
		chrome.tabs.create({
			url: `${BASE}/?query=${encodeURIComponent(info.selectionText)}`,
		});
	}
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status === 'complete')
		checkUrl(tabId, tab.url);
});

async function openUpdatePage(tab) {
	const [{ result: html }] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: () => document.documentElement.outerHTML,
	});

	const display = await getCurrentDisplay();
	const area = display.workArea;

	const updateWin = await chrome.windows.create({
		url: `${BASE}/update.html`
			+ `?url=${encodeURIComponent(tab.url)}`
			+ `&title=${encodeURIComponent(tab.title)}`,
		type: 'popup',
		width: WINDOW_WIDTH,
		height: WINDOW_HEIGHT,
		left: area.left + area.width - WINDOW_WIDTH - (WINDOW_MARGIN + 10),
		top: area.top + area.height - (WINDOW_HEIGHT - 20) - WINDOW_MARGIN,
	});
	chrome.tabs.onUpdated.addListener(function listener(id, info) {
		if (id !== updateWin.tabs[0].id || info.status !== 'complete')
			return;
		chrome.tabs.onUpdated.removeListener(listener);

		chrome.scripting.executeScript({
			target: { tabId: id },
			func: html => document.querySelector('#html').value = html,
			args: [html],
		});
	});
}

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

async function getCurrentDisplay() {
	const currentWin = await chrome.windows.getCurrent();
	const centerX = currentWin.left + currentWin.width / 2;
	const displays = await chrome.system.display.getInfo();
	return displays.find(d =>
		(centerX >= d.workArea.left) && (centerX < d.workArea.left + d.workArea.width),
	) || displays[0];
}
