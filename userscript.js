// ==UserScript==
// @name         Nookmark Capture
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Save current page to Nookmark local brain
// @author       Gemini 3 Pro
// @match        *://*/*
// @noframes
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// ==/UserScript==

(function () {
	'use strict';

	const API_ENDPOINT = 'http://localhost:3000/api/save';

	// Register Menu Commands
	GM_registerMenuCommand('Nookmark + Pinboard', () => capturePage(true));
	GM_registerMenuCommand('Nookmark', () => capturePage(false));

	// Keyboard Shortcut: Ctrl + Shift + P
	document.addEventListener('keydown', e => {
		if (e.ctrlKey && e.shiftKey && (e.key === 'p' || e.key === 'P'))
			capturePage(true);
	});

	function capturePage(openPinboard = false) {
		const modeLabel = openPinboard ? '+ Pinboard' : '(Only)';
		console.log(`[Nookmark] Capturing page... ${modeLabel}`);

		const payload = {
			url: window.location.href,
			title: document.title,
			html: document.documentElement.outerHTML,
		};

		GM_xmlhttpRequest({
			method: 'POST',
			url: API_ENDPOINT,
			headers: { 'Content-Type': 'application/json' },
			data: JSON.stringify(payload),
			onload: response => handleResponse(response, payload, openPinboard),
			onerror: err => handleError(err),
		});
	}

	function handleResponse(response, payload, openPinboard) {
		if (response.status === 200) {
			console.log('[Nookmark] Success:', JSON.parse(response.responseText));

			if (openPinboard) {
				openPinboardWindow(payload.url, payload.title);
			} else {
				GM_notification({
					text: 'Saved to Nookmark successfully!',
					title: 'Nookmark Captured',
					timeout: 2000,
				});
			}
		} else {
			console.error('[Nookmark] Error:', response.responseText);
			alert(`Nookmark Save Failed: ${response.responseText}`);
		}
	}

	function handleError(err) {
		console.error('[Nookmark] Request Failed:', err);
		alert('Nookmark unreachable. Is server running?');
	}

	function openPinboardWindow(url, title) {
		const pinboardUrl =
			`https://pinboard.in/add?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
		window.open(pinboardUrl, '_blank', 'width=700,height=550,toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1,left=100,top=100');
	}
})();
