const SERVER_URL = 'http://localhost:5050';

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
		openSearchPage(info.selectionText.trim());
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (info.status == 'loading')
		checkUrl(tab);
});

async function openUpdatePage(contentTab) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId: contentTab.id },
			func: contentScript,
			args: [contentTab.id],
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

async function cleanupHtmlStorage() {
	const items = await chrome.storage.local.get();
	const keys = Object.keys(items)
		.filter(k => k.startsWith('session:'));
	chrome.storage.local.remove(keys);
}

function contentScript(tabId) {
	const HOST_ID = 'nookmark-shadow-host';
	if (document.getElementById(HOST_ID))
		return;

	const sessionId = tabId + ':' + Date.now();

	const host = document.createElement('div');
	host.id = HOST_ID;
	document.body.appendChild(host);

	const iframe = document.createElement('iframe');
	iframe.src = chrome.runtime.getURL('public/update.html')
		+ `?url=${encodeURIComponent(location.href)}`
		+ `&title=${encodeURIComponent(document.title)}`
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

	chrome.storage.local.set({
		['session:' + sessionId + ':html']: document.documentElement.outerHTML,
	});

	// テキスト選択を監視する
	const handleSelection = e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection)
			chrome.runtime.sendMessage({ sessionId, selection });
	};
	document.addEventListener('mouseup', handleSelection);

	chrome.runtime.onMessage.addListener(function listener(msg) {
		if (msg.sessionId !== sessionId)
			return;

		if (msg.type === 'detach' || msg.type === 'dismiss')
			host.remove();

		if (msg.type === 'dismiss' || msg.type === 'close') {
			chrome.runtime.onMessage.removeListener(listener);
			document.removeEventListener('mouseup', handleSelection);
		}
	});
}
