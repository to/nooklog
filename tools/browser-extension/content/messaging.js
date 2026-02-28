(() => {
	// 二重実行を抑制する
	if (window.nooklogBridgeLoaded)
		return;

	window.nooklogBridgeLoaded = true;

	let sessionId = new URLSearchParams(window.location.search).get('sessionId');
	window.addEventListener('nooklog:send', e => {
		if (!chrome.runtime?.id || !sessionId)
			return;

		chrome.storage.local.set({
			[sessionId + 'messaage:' + Math.random().toString(36).slice(-8)]:
				e.detail,
		});
	});

	window.addEventListener('nooklog:command', e => {
		// 拡張が更新されたか？
		if (!chrome.runtime?.id)
			return;

		const msg = e.detail;
		if (msg.event === 'initialize') {
			sessionId = msg.sessionId;
			return;
		}

		if (msg.event === 'restore') {
			// 非同期データ(HTML/編集内容)を復元する
			const dataKey = sessionId + 'data';
			chrome.storage.local.get(dataKey, items => {
				const data = items[dataKey];
				if (data) {
					window.dispatchEvent(new CustomEvent('nooklog:receive', {
						detail: {
							...data,
							event: 'restore',
						},
					}));
					chrome.storage.local.remove(dataKey);
				}
			});
			return;
		}

		if (msg.event === 'save') {
			chrome.storage.local.set({
				[sessionId + 'data']: msg,
			});
			return;
		}

		if (msg.event === 'config') {
			chrome.storage.local.set({ config: msg.config });
			return;
		}
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local' || !sessionId)
			return;

		for (const [key, { newValue }] of Object.entries(changes)) {
			if (newValue && key.startsWith(sessionId + 'messaage:')) {
				window.dispatchEvent(new CustomEvent('nooklog:receive', {
					detail: { ...newValue },
				}));
				chrome.storage.local.remove(key);
			}
		}
	});
})();

function dispatch(type, msg = {}) {
	window.dispatchEvent(new CustomEvent(`nooklog:${type}`, { detail: { ...msg } }));
}
