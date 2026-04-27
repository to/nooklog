const [{ config = {} }, [tab]] = await Promise.all([
	chrome.storage.local.get('config'),
	chrome.tabs.query({ active: true, currentWindow: true }),
]);

const isEmbed = window.parent !== window;
const ctx = {
	tabId: isEmbed ? (tab?.id || 0) : 0,
	windowId: tab?.windowId || 0,
};

document.documentElement.classList.add(
	(config['client.theme'] === 'system') ?
		(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') :
		config['client.theme'].split('-')[0]);

// EN: サイドパネルから開かれたときはパラーメータがない
let src = new URLSearchParams(window.location.search).get('src');
if (!src) {
	const url = new URL(`${config['extension.serverAddress']}/update.html`);
	url.searchParams.set('view', 'sidepanel');
	src = url.href;
}

// Propagate IDs to the inner iframe
const url = new URL(src);
url.searchParams.set('tabId', ctx.tabId);
url.searchParams.set('windowId', ctx.windowId);

// Spawn specified URL as an iframe
const iframe = document.createElement('iframe');
iframe.src = url.href;
document.body.appendChild(iframe);
