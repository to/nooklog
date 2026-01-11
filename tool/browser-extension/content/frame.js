const { config = {} } = await chrome.storage.local.get('config');
document.documentElement.classList.add(
	(config['client.theme'] === 'system') ?
		(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') :
		config['client.theme']);

// Spawn specified URL as an iframe
const ps = new URLSearchParams(window.location.search);
const src = ps.get('src');
const iframe = document.createElement('iframe');
iframe.src = src;

document.body.appendChild(iframe);

bridge.on('UpdateForm:detach', () => openWindow(src));

// Close to the minimum size allowed by browsers
async function openWindow(url) {
	const width = 500;
	const height = 480;
	chrome.windows.create({
		url,
		type: 'popup',
		width, height,
		left: screen.availLeft + screen.availWidth - width - 30, // Dodge the scrollbar
		top: config['client.windowPosition'] === 'top-right'
			? screen.availTop + 8
			: screen.availTop + screen.availHeight - height - 2,
	});
}
