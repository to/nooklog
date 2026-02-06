// ==UserScript==
// @name         Nookmark
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Save current page to Nookmark
// @author       Gemini 3 Pro
// @match        *://*/*
// @noframes
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(() => {
	const SERVER_ROOT = 'http://localhost:3000';
	const API_ENDPOINT = `${SERVER_ROOT}/api/bookmarks`;

	// 予め保存したHTMLデータを復元する
	if (location.href.startsWith(`${SERVER_ROOT}/update.html`)) {
		const bookmark = GM_getValue('bookmark');
		const url = new URLSearchParams(location.search).get('url');
		if (bookmark && bookmark.url === url)
			document.querySelector('#html').value = bookmark.html;

		return;
	}

	const WINDOW_WIDTH = 500;
	const WINDOW_HEIGHT = 480;
	const WINDOW_MARGIN = 25;
	const NOTIFICATION_TIMEOUT = 2 * 1000;

	GM_registerMenuCommand('Edit', () => capturePage({ openEdit: true }));
	for (let i = 1; i <= 5; i++)
		GM_registerMenuCommand(`Add ${'★'.repeat(i)}`, () => capturePage({ rating: i }));

	// Keyboard Shortcut: Ctrl + Shift + P
	document.addEventListener('keydown', e => {
		if (e.ctrlKey && e.shiftKey && e.code == 'KeyP')
			capturePage({ openEdit: true });
	});

	function capturePage({ openEdit = false, rating }) {
		const payload = {
			url: window.location.href,
			title: document.title,
			html: document.documentElement.outerHTML,
			rating: rating,
		};

		if (openEdit) {
			GM_setValue('bookmark', payload);
			openUpdateWindow(payload);
		} else {
			// Background Save
			GM_xmlhttpRequest({
				method: 'POST',
				url: API_ENDPOINT,
				headers: { 'Content-Type': 'application/json' },
				data: JSON.stringify(payload),
				onload: res => handleResponse(res),
				onerror: handleError,
			});
		}
	}

	function handleResponse(res) {
		if (res.status != 200)
			return alert(`Nookmark Save Failed: ${res.responseText}`);

		GM_notification({
			title: 'Nookmark',
			text: 'Saved: ' + document.title,
			timeout: NOTIFICATION_TIMEOUT,
		});
	}

	function handleError(err) {
		console.error('[Nookmark] Request Failed:', err);
		alert('Nookmark unreachable. Is server running?');
	}

	function openUpdateWindow(payload) {
		// openのサイズや高さのズレを修正する(詳細不明)
		const left = screen.availWidth - WINDOW_WIDTH - (WINDOW_MARGIN + 9);
		const top = screen.availHeight - (WINDOW_HEIGHT - 10) - WINDOW_MARGIN;

		window.open(`${SERVER_ROOT}/update.html?url=${encodeURIComponent(payload.url)}&title=${encodeURIComponent(payload.title)}`, '_blank',
			`width=${WINDOW_WIDTH},height=${WINDOW_HEIGHT},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1`);
	}
})();
