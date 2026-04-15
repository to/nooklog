// ==UserScript==
// @name         Nooklog - Auto Tagging
// @description  Automatically add tags based on URL patterns
// @namespace    https://github.com/to
// @version      0.1
// @author       to, mii
//
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
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
		for (const [pattern, tags] of Object.entries(autoTags)) {
			if (bookmark.url.includes(pattern))
				bookmark.tags = [...new Set([...(bookmark.tags ?? []), ...tags])];
		}

		return bookmark;
	});
})();
