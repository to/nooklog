const [{ config = {} }, [tab]] = await Promise.all([
	chrome.storage.local.get('config'),
	chrome.tabs.query({ active: true, currentWindow: true }),
]);

document.documentElement.classList.add(
	(config['client.theme'] === 'system') ?
		(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') :
		config['client.theme'].split('-')[0]);

const isEmbed = window.parent !== window;
const ctx = {
	tabId: isEmbed ? (tab?.id || 0) : 0,
	windowId: tab?.windowId || 0,
};

// Relay events from the embedded edit form
window.args = [ctx];
await import('./bridge.js');

// There are no parameters when opened from the side panel
const params = new URLSearchParams(window.location.search);
let src = params.get('src');
if (!src) {
	const serverUrl = new URL(`${config['extension.serverAddress']}/update.html`);
	serverUrl.searchParams.set('view', 'sidepanel');
	src = serverUrl.href;
}

const isPopup = new URL(src).searchParams.get('view') === 'popup';
if (isPopup) {
	// Adjust window size if the source URL indicates popup mode
	document.documentElement.style.width = '340px';
	document.documentElement.style.height = '460px';

	bridge.on('UpdateForm:closePopup', () => window.close(), { window: true });
}

// Propagate IDs to the inner iframe
const url = new URL(src);
url.searchParams.set('tabId', ctx.tabId);
url.searchParams.set('windowId', ctx.windowId);

// Spawn specified URL as an iframe
const iframe = document.createElement('iframe');
iframe.src = url.href;
document.body.appendChild(iframe);
