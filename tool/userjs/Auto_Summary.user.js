// ==UserScript==
// @name         Nooklog - Auto Summary
// @description  Summarize markdown content using Ollama
// @namespace    https://github.com/to
// @version      0.1
// @author       quoposk, mii(Gemini 3 Flash)
//
// @match        http://localhost:*/update.html*
// @match        http://127.0.0.1:*/update.html*
// @icon         https://cdn.jsdelivr.net/gh/to/nooklog@main/public/image/icon_32.png
//
// @connect      localhost
// @connect      *
//
// @grant        GM_xmlhttpRequest
//
// @run-at       document-idle
// ==/UserScript==

/* global beforeHook, UpdateForm */

const serverUrl = 'http://localhost:11434/v1';
const model = 'gemma3:4b';

(() => {
	if (typeof beforeHook === 'undefined')
		return;

	const summarize = async text => {
		const content = text.slice(0, 15000);
		console.log(content.length);

		const prompt = `
Summarize the following text in 3 concise bullet points (- format), within 160 characters in total in English.
Do not include any introductions or explanations. Output only the response.

Example Output:
- Explains Chrome extension development and publishing.
- Provides examples for manifest and icon preparation.
- Shows modern ES2016 code and dev experiences.

Text:
${content}`.trim();

		const res = await request('POST', '/chat/completions', {
			model,
			messages: [{ role: 'user', content: prompt }],
			stream: false,
		});
		console.log(res);
		return res?.choices?.[0]?.message?.content?.trim();
	};

	beforeHook(UpdateForm.prototype, 'setBookmark', async function (bookmark) {
		if (!bookmark.markdown || bookmark.summary)
			return;

		const summary = await summarize(bookmark.markdown);
		if (summary)
			this.setBookmark({ summary });
	});
})();

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
			onload: r => r.status === 200
				? resolve(JSON.parse(r.responseText || 'null'))
				: reject(r),
			onerror: reject,
		});
	});
}
