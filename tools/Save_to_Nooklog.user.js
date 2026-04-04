// ==UserScript==
// @name         Save to Nooklog
// @description  Quickly save current page URL and title to Nooklog
// @namespace    https://github.com/to
// @version      1.2
// @author       to
//
// @match        *://*/*
// @connect      localhost
// @connect      *
// @noframes
//
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

const isTopRight = false;

let serverUrl = GM_getValue('server_url');

const ensureServerUrl = async () => {
	let url = serverUrl || 'http://localhost:3000';
	while (url) {
		if (await checkAlive(url)) {
			serverUrl = url;
			GM_setValue('server_url', url);
			return url;
		}

		url = prompt('Enter Nooklog Server Address:', url);
		url = url?.replace(/\/$/, '');
	}
	return null;
};

const checkAlive = url => new Promise(resolve => {
	GM_xmlhttpRequest({
		method: 'GET',
		url: `${url}/api/alive`,
		timeout: 1000,
		onload: r => resolve(r.status === 200),
		onerror: () => resolve(false),
		ontimeout: () => resolve(false),
	});
});

const capture = async () => {
	const baseUrl = await ensureServerUrl();
	if (!baseUrl)
		return;

	const url = location.href;
	const title = document.title;
	const html = document.documentElement.outerHTML;

	// サーバーに現在の状態を一時保存してから編集画面を開く
	GM_xmlhttpRequest({
		method: 'POST',
		url: `${baseUrl}/api/stash`,
		headers: { 'Content-Type': 'application/json' },
		data: JSON.stringify({ url, title, html }),
		onload: () => {
			const query = `url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
			openWindow(`${baseUrl}/update.html?${query}`);
		},
		onerror: () => {
			alert('Lost connection to Nooklog server.');
			GM_setValue('server_url', ''); // 次回再入力を促す
		},
	});
};

GM_registerMenuCommand('Edit with Nooklog', capture);

window.addEventListener('keydown', async e => {
	if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
		e.preventDefault();
		e.stopPropagation();
		await capture();
	}
});

function openWindow(url) {
	const width = 500;
	const height = 480;
	const left = screen.availLeft + screen.availWidth - width - 30;
	const top = isTopRight
		? screen.availTop + 8
		: screen.availTop + screen.availHeight - height - 2;
	const features = `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=0,scrollbars=1,resizable=1`;
	window.open(url, 'nooklog', features);
}
