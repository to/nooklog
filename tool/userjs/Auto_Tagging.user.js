// ==UserScript==
// @name         Nooklog - Auto Tagging
// @description  Automatically add tags based on URL patterns
// @namespace    https://github.com/to
// @version      0.1
// @author       quoposk, mii(Gemini 3 Flash)
//
// @match        http://localhost:*/update.html*
// @match        http://127.0.0.1:*/update.html*
// @icon         https://cdn.jsdelivr.net/gh/to/nooklog@main/public/image/icon_32.png
//
// @run-at       document-idle
// ==/UserScript==

/* global beforeHook, afterHook, UpdateForm */

(() => {
	if (!beforeHook)
		return;

	const autoTags = {
		'youtube.com': ['video'],
		'reddit.com/r/Music': ['music', 'reddit'],
	};

	beforeHook(UpdateForm.prototype, 'setBookmark', bookmark => {
		if (!bookmark)
			return;

		for (const [pattern, tags] of Object.entries(autoTags)) {
			if (bookmark.url.includes(pattern))
				bookmark.tags = [...new Set([...(bookmark.tags ?? []), ...tags])];
		}

		return bookmark;
	});
})();
