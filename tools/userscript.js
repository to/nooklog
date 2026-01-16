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
// ==/UserScript==

(function () {
	const API_ENDPOINT = 'http://localhost:3000/api/bookmarks';

	const WINDOW_WIDTH = 500;
	const WINDOW_HEIGHT = 480;
	const WINDOW_MARGIN = 25;
	const NOTIFICATION_TIMEOUT = 2 * 1000;

	let updateWindow = null;

	GM_registerMenuCommand('Edit', () => capturePage({ openEdit: true }));
	for (let i = 1; i <= 5; i++)
		GM_registerMenuCommand(`Add ${'★'.repeat(i)}`, () => capturePage({ rating: i }));

	// Keyboard Shortcut: Ctrl + Shift + P
	document.addEventListener('keydown', e => {
		if (e.ctrlKey && e.shiftKey && e.code == 'KeyP')
			capturePage({ openEdit: true });
	});

	function capturePage({ openEdit = false, rating }) {
		// ポップアップブロックを回避するために、即座にウィンドウを確保する
		if (openEdit)
			openUpdateWindow();

		GM_xmlhttpRequest({
			method: 'POST',
			url: API_ENDPOINT,
			headers: { 'Content-Type': 'application/json' },
			data: JSON.stringify({
				url: window.location.href,
				title: document.title,
				html: document.documentElement.outerHTML,
				rating: rating,
			}),
			onload: res => handleResponse(res, openEdit),
			onerror: handleError,
		});
	}

	function handleResponse(res, openEdit) {
		if (res.status != 200)
			return alert(`Nookmark Save Failed: ${res.responseText}`);

		const data = JSON.parse(res.responseText);
		if (openEdit && updateWindow) {
			updateWindow.location.replace(`http://localhost:3000/update.html?id=${data.id}`);
		} else {
			GM_notification({
				title: 'Nookmark',
				text: 'Saved: ' + document.title,
				timeout: NOTIFICATION_TIMEOUT,
			});
		}
	}

	function handleError(err) {
		if (updateWindow)
			updateWindow.close();

		console.error('[Nookmark] Request Failed:', err);
		alert('Nookmark unreachable. Is server running?');
	}

	function openUpdateWindow() {
		// openのサイズや高さのズレを修正する(詳細不明)
		const left = screen.availWidth - WINDOW_WIDTH - (WINDOW_MARGIN + 9);
		const top = screen.availHeight - (WINDOW_HEIGHT - 10) - WINDOW_MARGIN;

		// フォーカスがアドレバーに行かないように、編集と同じページを開く
		updateWindow = window.open('http://localhost:3000/update.html', '_blank',
			`width=${WINDOW_WIDTH},height=${WINDOW_HEIGHT},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1`);
	}
})();
