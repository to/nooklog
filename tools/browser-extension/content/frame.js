const { config = {} } = await chrome.storage.local.get('config');
document.documentElement.classList.add(
	(config['client.theme'] === 'system') ?
		(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') :
		config['client.theme']);

// 指定されたURLをiframeとして展開する
const ps = new URLSearchParams(window.location.search);
const src = ps.get('src');
const iframe = document.createElement('iframe');
iframe.src = src;

document.body.appendChild(iframe);

bridge.on('UpdateForm:detach', () => openWindow(src));

// ブラウザに許可される最小値に近いサイズ
async function openWindow(url) {
	const width = 500;
	const height = 480;
	chrome.windows.create({
		url,
		type: 'popup',
		width, height,
		left: screen.availLeft + screen.availWidth - width - 30, // スクロールバーを避ける
		top: config['client.windowPosition'] === 'top-right'
			? screen.availTop + 8
			: screen.availTop + screen.availHeight - height - 2,
	});
}
