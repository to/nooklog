const BASE = 'http://localhost:3000';
const WINDOW_WIDTH = 500;
const WINDOW_HEIGHT = 480;
const WINDOW_MARGIN = 25;
const MEMO_DELIMITER = '/';

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

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status === 'complete')
		checkUrl(tab);
});

async function openUpdatePage(tab) {
	// 対象ページのHTMLを取得する
	const [{ result: html }] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: () => document.documentElement.outerHTML,
	});

	// 更新ページを開く
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

	// HTMLを更新ページにセットする
	const updateTabId = updateWin.tabs[0].id;
	chrome.tabs.onUpdated.addListener(function listener(id, info) {
		if (id !== updateTabId || info.status !== 'complete')
			return;

		chrome.tabs.onUpdated.removeListener(listener);

		chrome.scripting.executeScript({
			target: { tabId: id },
			func: html => document.querySelector('#html').value = html,
			args: [html],
		});
	});

	// テキスト選択を監視する
	chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: () => {
			// サービスワーカーがスリーブするのを防ぐ
			setInterval(() => {
				chrome.runtime.sendMessage({});
			}, 20 * 1000);

			document.addEventListener('mouseup', e => {
				if (e.button !== 0)
					return;

				const text = window.getSelection().toString().trim();
				if (text)
					chrome.runtime.sendMessage({ selection: text });
			});
		},
	});

	// 選択テキストを更新ページにセットする
	let previousSelection = '';
	const onMessage = (msg, sender) => {
		if (!msg.selection || sender.tab.id !== tab.id || msg.selection === previousSelection)
			return;

		previousSelection = msg.selection;
		chrome.scripting.executeScript({
			target: { tabId: updateTabId },
			func: (text, delimiter) => {
				// サービスワーカーとは別のスコープになる
				const memo = document.querySelector('#memo');
				memo.value += (memo.value.length ? delimiter : '') + text;
			},
			args: [msg.selection, MEMO_DELIMITER],
		});
	};
	chrome.runtime.onMessage.addListener(onMessage);

	// メッセージリスナーを解放する
	chrome.windows.onRemoved.addListener(function listener(winId) {
		if (winId !== updateWin.id)
			return;

		chrome.windows.onRemoved.removeListener(listener);
		chrome.runtime.onMessage.removeListener(onMessage);
	});
}

async function openSearchPage(query) {
	chrome.tabs.create({
		url: `${BASE}/?query=${encodeURIComponent(query)}`,
	});
}

async function checkUrl(tab) {
	// 特殊なページは除外する
	if (!tab.url || /^(chrome|chrome-extension|devtools|about|edge):/.test(tab.url))
		return;

	try {
		// ブックマーク済みかチェックする
		const res = await fetch(
			`${BASE}/api/bookmarks?url=${encodeURIComponent(tab.url)}`);
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
