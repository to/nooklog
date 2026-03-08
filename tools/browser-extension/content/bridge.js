var sessionId = new URLSearchParams(window.location.search).get('sessionId');
var bridge = {
	on: (event, listner, useSession) => {
		window.addEventListener(`Nooklog:${event}`, e => {
			// 拡張が正常な状態か？
			if (chrome.runtime?.id && (!useSession || sessionId))
				listner(e.detail);
		});
	},
	emit: (event, msg = {}, transfer = false) => {
		if (transfer) {
			msg.event = event;
			event = 'Bridge:transfer';
		}
		window.dispatchEvent(new CustomEvent(`Nooklog:${event}`, { detail: msg }));
	},
};

(() => {
	// 二重実行を抑制する
	if (window.nooklogBridgeLoaded)
		return;

	window.nooklogBridgeLoaded = true;

	bridge.on('Content:initialize', msg => sessionId = msg.sessionId);

	bridge.on('Nooklog:config', msg => {
		chrome.storage.local.set({ config: msg.config });
	});

	['Content:save:html', 'UpdateForm:save:bookmark'].forEach(event => {
		bridge.on(event, msg => {
			msg.label = event.split(':').pop();
			chrome.storage.local.set({ [sessionId + 'data']: msg });
		}, true);
	});

	bridge.on('UpdateForm:restore', msg => {
		const key = sessionId + 'data';
		chrome.storage.local.get(key, items => {
			const data = items[key];
			if (!data)
				return bridge.emit('Bridge:restore:empty');

			const label = data.label;
			delete data.label;
			bridge.emit(`Bridge:restore:${label}`, data);
			chrome.storage.local.remove(key);
		});
	});

	// メッセージを転送する
	bridge.on('Bridge:transfer', msg => {
		chrome.storage.local.set({
			[sessionId + 'message:' + Math.random().toString(36).slice(-8)]: msg,
		});
	}, true);

	// メッセージを受信する
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local' || !sessionId)
			return;

		for (const [key, { newValue }] of Object.entries(changes)) {
			if (newValue && key.startsWith(sessionId + 'message:')) {
				const { event, ...msg } = newValue;
				bridge.emit(event, msg);
				chrome.storage.local.remove(key);
			}
		}
	});
})();
