let config = {};
chrome.storage.local.get('config').then(r => {
	Object.assign(config, r.config || {});

	// Trigger integrity check upon worker startup
	registerMessagingBridge();
});

const tint = {
	tomato: '#ef7253',
	red: '#ed6f6a',
	ruby: '#eb6c7c',
	crimson: '#eb6a8e',
	pink: '#e769b1',
	plum: '#c673d2',
	purple: '#b179e1',
	violet: '#9883e3',
	iris: '#8f86e8',
	indigo: '#7a8de9',
	blue: '#539ceb',
	cyan: '#36acc6',
	teal: '#05b69b',
	jade: '#21b58b',
	green: '#32b477',
	grass: '#55ae65',
	bronze: '#b09083',
	gold: '#a6957c',
	brown: '#b69174',
	orange: '#eb8038',
	amber: '#dda00b',
	yellow: '#d2b12c',
	lime: '#95ba53',
	mint: '#3baf96',
	sky: '#51a5ce',
};

import './content/bridge.js';

bridge.on('ConfigDialog:shortcuts', async msg => {
	const commands = await chrome.commands.getAll();
	bridge.emit('Background:shortcuts', {
		shortcuts: commands,
	}, true);
});

bridge.on('ConfigDialog:openShortcuts', () => {
	chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
	if (reason === 'install') {
		// Save default settings
		await chrome.storage.local.set({
			config: {
				'extension.serverAddress': 'http://localhost:5050',
			},
		});

		chrome.tabs.create({
			url: 'page/setting.html',
		});
	}

	// Always visible in extension icon context menu (solution unknown)
	chrome.contextMenus.create({
		id: 'search-nooklog',
		title: 'Search Nooklog for "%s"',
		contexts: ['selection'],
	});

	cleanupSessionData();
});

// Synchronize and monitor config changes
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
	// Exclude extension icon click events
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
		// Script injection denied pages (e.g. chrome://, Chrome store)
	}
}

async function openSearchPage(query) {
	chrome.tabs.create({
		url: `${config['extension.serverAddress']}/?query=${encodeURIComponent(query)}`,
		active: !!config['extension.openSearchInForeground'],
	});
}

bridge.on('Content:stash', async payload => {
	await fetch(`${config['extension.serverAddress']}/api/stash`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
});

bridge.on('UpdateForm:save', async bookmark => {
	checkedUrls.delete(bookmark.url);

	const tabs = await chrome.tabs.query({});
	for (const tab of tabs) {
		if (tab.url === bookmark.url)
			setIcon(tab.id, true);
	}
});

const checkedUrls = new Map();

async function checkUrl(tab) {
	// Exclude special pages
	const url = tab.url;
	if (!url || /^(chrome|chrome-extension|devtools|about|edge):/.test(url))
		return;

	// Debounce successive checks on the same URL
	const now = Date.now();
	let cache = checkedUrls.get(url);
	if (!cache || now - cache.time >= 20 * 1000) {
		try {
			// Check if already bookmarked
			const res = await fetch(
				`${config['extension.serverAddress']}/api/find?url=${encodeURIComponent(url)}`);
			cache = { time: now, data: await res.json() };
			checkedUrls.set(url, cache);
		} catch {
			return;
		}
	}

	setIcon(tab.id, !!cache.data);
}

async function setIcon(tabId, isBookmarked) {
	try {
		const color = tint[config['client.tint']] || tint.grass;
		chrome.action.setBadgeText({ tabId, text: isBookmarked ? ' ' : '' });
		if (isBookmarked)
			chrome.action.setBadgeBackgroundColor({ tabId, color });
	} catch {
	}
}

// Clear abnormally terminated session data
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
