let config = {};
chrome.storage.local.get('config').then(r => {
	Object.assign(config, r.config || {});

	// ワーカー起動時に整合性チェックを開始
	registerMessagingBridge();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
	if (reason === 'install') {
		// 設定のデフォルト値を保存する
		await chrome.storage.local.set({
			config: {
				'extension.serverAddress': 'http://localhost:5050',
			},
		});

		chrome.tabs.create({
			url: 'page/setting.html',
		});
	}

	// 拡張アイコンのコンテキストメニューに常に表示されてしまう(解決方法不明)
	chrome.contextMenus.create({
		id: 'search-nooklog',
		title: 'Search Nooklog for "%s"',
		contexts: ['selection'],
	});

	cleanupSessionData();
});

// 設定の変更を監視して同期する
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.config) {
		Object.assign(config, changes.config.newValue || {});
		registerMessagingBridge();
	}
});

chrome.runtime.onStartup.addListener(() => cleanupSessionData());

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

chrome.contextMenus.onClicked.addListener(info => {
	// 拡張アイコンをクリックされた時を除外する
	if (info.menuItemId === 'search-nooklog' && info.selectionText)
		openSearchPage(info.selectionText.trim());
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (!info.favIconUrl && info.status === 'loading')
		checkUrl(tab);
});

async function openUpdatePage(tab) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			files: [
				'content/bridge.js',
				'content/content.js',
			],
		});
	} catch {
		// スクリプトの埋め込みが許可されないページ(chrome://や拡張ストアなど)
	}
}

async function openSearchPage(query) {
	chrome.tabs.create({
		url: `${config['extension.serverAddress']}/?query=${encodeURIComponent(query)}`,
		active: !!config['extension.openSearchInForeground'],
	});
}

const checkedUrls = new Map();

async function checkUrl(tab) {
	// 特殊なページは除外する
	const url = tab.url;
	if (!url || /^(chrome|chrome-extension|devtools|about|edge):/.test(url))
		return;

	// 同一URLへの連続チェックを抑制する
	const now = Date.now();
	let cache = checkedUrls.get(url);
	if (!cache || now - cache.time >= 20 * 1000) {
		try {
			// ブックマーク済みかチェックする
			const res = await fetch(
				`${config['extension.serverAddress']}/api/bookmarks?url=${encodeURIComponent(url)}`);
			cache = { time: now, data: await res.json() };
			checkedUrls.set(url, cache);
		} catch {
			return;
		}
	}

	try {
		const tint = config['client.tint'] || 'grass';
		const icon = cache.data ? `image/tint/${tint}_32.png` : 'image/tint/gray_32.png';
		await chrome.action.setIcon({
			tabId: tab.id,
			path: {
				16: icon,
				32: icon,
			},
		});
	} catch {
	}
}

// 異常終了したセッションデータをクリアする
async function cleanupSessionData() {
	const items = await chrome.storage.local.get();
	const keys = Object.keys(items)
		.filter(k => k.startsWith('session:'));
	chrome.storage.local.remove(keys);
}

async function registerMessagingBridge() {
	try {
		const scriptId = 'messaging-bridge';
		const url = config['extension.serverAddress'];
		if (!url)
			return;

		const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
		const currentMatch = scripts[0]?.matches?.[0];
		const targetMatch = `${url}/*`;

		if (currentMatch === targetMatch)
			return;

		if (scripts.length > 0)
			await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });

		await chrome.scripting.registerContentScripts([{
			id: scriptId,
			matches: [targetMatch],
			js: ['content/bridge.js'],
			runAt: 'document_start',
			allFrames: true,
		}]);
	} catch (e) {
		console.error('Failed to register messaging bridge:', e);
	}
}
