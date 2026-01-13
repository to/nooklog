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
	'use strict';

	const API_ENDPOINT = 'http://localhost:3000/api/save';

	// Register Menu Commands
	GM_registerMenuCommand('Edit', () => capturePage(true));
	GM_registerMenuCommand('Add ★★★', () => capturePage(false));

	// Keyboard Shortcut: Ctrl + Shift + P
	document.addEventListener('keydown', e => {
		if (e.ctrlKey && e.shiftKey && (e.key === 'p' || e.key === 'P'))
			capturePage(true);
	});

	function capturePage(openEdit = false) {
		const modeLabel = openEdit ? '+ Edit' : '(Quick)';
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
			onload: response => handleResponse(response, payload, openEdit),
			onerror: err => handleError(err),
		});
	}

	function handleResponse(response, payload, openEdit) {
		if (response.status === 200) {
			const data = JSON.parse(response.responseText);
			console.log('[Nookmark] Success:', data);

			if (openEdit) {
				openUpdateWindow(data.id);
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

	function openUpdateWindow(id) {
		const updateUrl = `http://localhost:3000/update.html?id=${id}`;
		window.open(updateUrl, '_blank', 'width=600,height=500,toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1,left=100,top=100');
	}
})();
