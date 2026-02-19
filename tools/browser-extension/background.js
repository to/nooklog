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
});

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
	// 更新ページより先にリスナーを準備する
	const sessionId = '' + Date.now();
	chrome.runtime.onMessage.addListener(async function listener(msg) {
		// 更新ページの準備ができてからHTMLを送信する
		if (msg.status === 'ready' && msg.sessionId === sessionId) {
			chrome.runtime.onMessage.removeListener(listener);

			try {
				await chrome.scripting.executeScript({
					target: { tabId: contentTab.id },
					func: contentScript,
					args: [sessionId],
				});
			} catch {
				// スクリプトの埋め込みが許可されないページ(chrome://や拡張ストアなど)
			}
		}
	});

	try {
		await chrome.scripting.executeScript({
			target: { tabId: contentTab.id },
			func: frameScript,
			args: [sessionId, contentTab.url, contentTab.title],
		});
	} catch {
	}
}

function frameScript(sessionId, url, title) {
	const HOST_ID = 'nookmark-shadow-host';
	if (document.getElementById(HOST_ID))
		return;

	const host = document.createElement('div');
	host.id = HOST_ID;
	document.body.appendChild(host);

	const iframe = document.createElement('iframe');
	iframe.src = chrome.runtime.getURL('public/update.html')
		+ `?url=${encodeURIComponent(url)}`
		+ `&title=${encodeURIComponent(title)}`
		+ `&sessionId=${sessionId}`;

	Object.assign(iframe.style, {
		position: 'fixed',
		top: '4px',
		right: '4px',
		width: '300px',
		height: '380px',
		border: 'none',
		zIndex: '2147483647',
		borderRadius: '4px',
		boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
	});

	const shadow = host.attachShadow({ mode: 'open' });
	shadow.appendChild(iframe);

	window.addEventListener('message', function listener(e) {
		if (e.data.status !== 'unload')
			return;

		window.removeEventListener('message', listener);
		host.remove();
	});
}

function contentScript(sessionId) {
	chrome.runtime.sendMessage({
		sessionId,
		html: document.documentElement.outerHTML,
	});

	// テキスト選択を監視する
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection)
			chrome.runtime.sendMessage({ sessionId, selection });
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
