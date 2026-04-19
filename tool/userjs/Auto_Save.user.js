// ==UserScript==
// @name         Nooklog - Auto Save
// @description  Automatically save the current page to Nooklog if it is not already bookmarked.
// @namespace    https://github.com/to
// @version      0.1
// @author       quoposk, mii(Gemini 3 Flash)
//
// @connect      localhost
// @connect      *
// @noframes
//
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
//
// @run-at       document-idle
// ==/UserScript==

/**
 * [Usage Guide]
 * This script is disabled by default for privacy and performance.
 * To enable auto-saving, you must manually add site matches in your
 * UserScript manager's settings (e.g., Tampermonkey > Settings > User matches).
 *
 * Example matches:
 * https://zenn.dev/*
 * https://github.com/*
 * https://www.reddit.com/r/*
 */

const serverUrl = GM_getValue('server_url') || 'http://localhost:5050';
const url = location.href;

// Configuration command
GM_registerMenuCommand('Configure Nooklog Server', () => {
	const newUrl = prompt('Enter Nooklog Server Address:', serverUrl);
	if (newUrl) {
		GM_setValue('server_url', newUrl.replace(/\/$/, ''));
		location.reload();
	}
});

setTimeout(async () => {
	try {
		// Check if already bookmarked
		if (await request('GET', `/api/find?url=${encodeURIComponent(url)}`))
			return;

		// Not bookmarked, proceed to save
		await request('POST', '/api/save', {
			url,
			title: document.title,
			html: document.documentElement.outerHTML,
		});

		console.log('Nooklog: Page auto-saved', url);
	} catch (e) {
		console.error('Nooklog: Auto-save failed', e);
	}
}, 3 * 1000);

/**
 * Promise-based GM_xmlhttpRequest wrapper.
 */
function request(method, path, body) {
	return new Promise((resolve, reject) => {
		GM_xmlhttpRequest({
			method,
			url: `${serverUrl}${path}`,
			headers: body ? { 'Content-Type': 'application/json' } : {},
			data: body ? JSON.stringify(body) : null,
			onload: r => (r.status === 200)
				? resolve(JSON.parse(r.responseText || 'null'))
				: reject(r),
			onerror: reject,
		});
	});
}
