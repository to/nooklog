import tint from './tint.js';
import './content/bridge.js';

let config = {};
chrome.storage.local.get('config').then(r => {
	Object.assign(config, r.config || {});

	// Trigger integrity check upon worker startup
	registerMessagingBridge();
});

// Allow content scripts to access chrome.storage.session
chrome.storage.session.setAccessLevel({
	accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
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

	// EN: Vivaldiのみ → 書き換え Always visible in extension icon context menu (solution unknown)
	chrome.contextMenus.create({
		id: 'search-nooklog',
		title: 'Search Nooklog for "%s"',
		contexts: ['selection'],
	});

	chrome.contextMenus.create({
		id: 'quick-save',
		title: 'Quick save',
		contexts: ['all'],
	});

	chrome.contextMenus.create({
		id: 'copy-as-markdown',
		title: 'Copy as Markdown',
		contexts: ['all'],
	});

	chrome.contextMenus.create({
		id: 'open-update-frame',
		title: 'Edit in page',
		contexts: ['all'],
	});

	chrome.contextMenus.create({
		id: 'open-update-panel',
		title: 'Edit in side panel',
		contexts: ['all'],
	});

	// TOFIX : Vivaldiで すぐにサイドパネルを閉じる？
});

// Synchronize and monitor config changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.config) {
		Object.assign(config, changes.config.newValue || {});
		registerMessagingBridge();
	}
});

chrome.action.onClicked.addListener(tab => {
	const action = config['extension.actionBehavior'] || 'embed';
	if (action === 'sidepanel')
		openUpdatePanel(tab);
	else if (action === 'save')
		saveBookmark(tab);
	else
		openUpdateFrame(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
	const run = async tab => {
		if (command === 'open-update-frame')
			openUpdateFrame(tab);

		if (command === 'open-update-panel')
			openUpdatePanel(tab);

		if (command === 'quick-save')
			saveBookmark(tab);
	};

	if (tab)
		run(tab);
	else
		getCurrentTab().then(run);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	// Exclude extension icon click events
	if (info.menuItemId === 'search-nooklog' && info.selectionText)
		openSearchPage(info.selectionText.trim());

	if (info.menuItemId === 'open-update-frame')
		openUpdateFrame(tab);

	if (info.menuItemId === 'quick-save')
		saveBookmark(tab);

	if (info.menuItemId === 'copy-as-markdown')
		copyMarkdownToClipboard(tab);

	if (info.menuItemId === 'open-update-panel')
		openUpdatePanel(tab);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
	if (!info.favIconUrl && info.status === 'loading')
		checkUrl(tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
	if (msg.type === 'Content:select') {
		bridge.emit('Content:select', { selection: msg.selection }, {
			tabId: sender.tab?.id,
			windowId: sender.tab?.windowId,
		});
	}
});

bridge.on('ConfigDialog:shortcuts', async msg => {
	const commands = await chrome.commands.getAll();
	bridge.emit('Background:shortcuts', {
		shortcuts: commands,
	});
});

bridge.on('ConfigDialog:openShortcuts', () => {
	chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

bridge.on('Nooklog:updateConfig', config => {
	chrome.storage.local.set({ config });
});

bridge.on('UpdateForm:refresh', async () => {
	refreshUpdatePanel(await getCurrentTab());
});

bridge.on('UpdateForm:save', async bookmark => {
	checkedUrls.delete(bookmark.url);

	const tabs = await chrome.tabs.query({});
	for (const tab of tabs) {
		if (tab.url === bookmark.url)
			setIcon(tab.id, true);
	}
});

bridge.on('UpdateForm:detach', msg => openUpdateWindow(msg.url));

bridge.on('UpdateForm:closePanel', async (_, meta) => {
	chrome.sidePanel.close({ windowId: meta.windowId }).catch(() => { });
});

async function stash(content, opt = {}) {
	await fetch(`${config['extension.serverAddress']}/api/stash`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(content),
	});

	// EN: tabとwindow それぞれに分けて通知する
	bridge.emit('Background:stashComplete', { url: content.url }, opt);
}

async function openSearchPage(query) {
	chrome.tabs.create({
		url: `${config['extension.serverAddress']}/?query=${encodeURIComponent(query)}`,
		active: !!config['extension.openSearchInForeground'],
	});
}

async function openUpdateFrame(tab) {
	try {
		await executeScript(tab, 'content/bridge.js');

		const content = await executeScript(tab, 'content/embedUpdateFrame.js');
		if (content)
			stash(content, { tabId: tab.id });
	} catch (e) {
		// Script injection denied pages (e.g. chrome://, Chrome store)
		const url = new URL(`${config['extension.serverAddress']}/update.html`);
		url.searchParams.set('url', tab.url);
		url.searchParams.set('title', tab.title);
		openUpdateWindow(url.href);
	}
}

async function openUpdateWindow(url) {
	// Close to the minimum size allowed by browsers
	const width = 500;
	const height = 480;

	url = new URL(url);
	url.searchParams.set('view', 'window');

	const screen = await getScreen();
	chrome.windows.create({
		url: url.href,
		type: 'popup',
		width, height,
		left: screen.left + screen.width - width - 30, // Dodge the scrollbar
		top: config['client.windowPosition'] === 'top-right'
			? screen.top + 8
			: screen.top + screen.height - height - 2,
	});
}

async function openUpdatePanel(tab) {
	// EN: Vivaldiでクエリパラメータを渡せない
	const sidePanelPath = 'content/frame.html';
	chrome.sidePanel.setOptions({
		path: sidePanelPath,
		enabled: true,
	});
	chrome.sidePanel.open({ windowId: tab.windowId });

	refreshUpdatePanel(tab);
}

async function refreshUpdatePanel(tab) {
	if (!tab)
		return;

	try {
		stash(await executeFunc(tab, () => ({
			url: location.href,
			title: document.title,
			html: document.documentElement.outerHTML,
		})), { windowId: tab.windowId });
	} catch {
		// Fallback for restricted pages (e.g., Chrome Web Store)
		bridge.emit('Background:stashComplete', {
			url: tab.url,
			title: tab.title,
		}, { windowId: tab.windowId });
	}
}

async function saveBookmark(tab) {
	const content = await executeFunc(tab, () => ({
		url: location.href,
		title: document.title,
		html: document.documentElement.outerHTML,
	}));

	await fetch(`${config['extension.serverAddress']}/api/save`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(content),
	});

	checkedUrls.delete(content.url);
	setIcon(tab.id, true);
}

async function copyMarkdownToClipboard(tab) {
	const { url, html } = await executeFunc(tab, () => ({
		url: location.href,
		html: document.documentElement.outerHTML,
	}));

	const res = await fetch(`${config['extension.serverAddress']}/api/markdown/convert`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, html }),
	});
	const { markdown } = await res.json();

	await executeFunc(tab, text => navigator.clipboard.writeText(text), [markdown]);
}

async function getScreen() {
	const [displays, win] = await Promise.all([
		chrome.system.display.getInfo(),
		getCurrentWindow(),
	]);

	// Find the display containing the window's center
	const cx = win.left + win.width / 2;
	const cy = win.top + win.height / 2;
	const display = displays.find(d => (
		cx >= d.bounds.left && cx <= d.bounds.left + d.bounds.width &&
		cy >= d.bounds.top && cy <= d.bounds.top + d.bounds.height
	)) || displays.find(d => d.isPrimary) || displays[0];

	return display.workArea;
}

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

async function registerMessagingBridge() {
	const url = config['extension.serverAddress'];
	if (!url)
		return;

	const scripts = [{
		id: 'messaging-bridge',
		matches: [`${url}/*`],
		js: ['content/bridge.js'],
		runAt: 'document_start',
		allFrames: true,
	}];

	if (config['extension.autoAppendSelection']) {
		scripts.push({
			id: 'capture-selection',
			matches: ['<all_urls>'],
			js: ['content/captureSelection.js'],
			runAt: 'document_start',
			allFrames: false,
		});
	}

	try {
		const ids = ['messaging-bridge', 'capture-selection'];

		// EN: 登録に変化が無ければスキップする
		const old = await chrome.scripting.getRegisteredContentScripts({ ids });
		const oldBridge = old.find(s => s.id === 'messaging-bridge');
		if (old.length === scripts.length && oldBridge?.matches[0] === scripts[0].matches[0])
			return;

		await chrome.scripting.unregisterContentScripts({ ids }).catch(() => { });
		await chrome.scripting.registerContentScripts(scripts);
	} catch (e) {
		console.error(e);
	}
}

async function executeScript(tab, files, args = []) {
	files = [].concat(files);

	const context = {
		scriptId: files.join('-'),
		tabId: tab.id,
		windowId: tab.windowId,
	};

	const isDuplicate = await executeFunc(tab, (ctx, args) => {
		if (window[ctx.scriptId])
			return true;

		window[ctx.scriptId] = true;
		window.args = [ctx, ...args];
		return false;
	}, [context, args]);

	if (isDuplicate)
		return;

	const [{ result }] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		files,
	});
	return result;
}

async function getCurrentTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

async function getCurrentWindow() {
	return await chrome.windows.getLastFocused();
}

async function executeFunc(tab, func, args = []) {
	const [{ result }] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func,
		args,
	});
	return result;
}
