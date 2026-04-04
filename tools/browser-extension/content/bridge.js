var isWorker = typeof window === 'undefined';
if (isWorker) {
	const listeners = {};
	globalThis.window = {
		addEventListener: (event, listener) => {
			listeners[event] ??= [];
			listeners[event].push({
				listener,
			});
		},
		dispatchEvent: e => {
			listeners[e.type]?.forEach(l => {
				l.listener(e);
			});
		},
	};
}

var SESSION_GLOBAL = 'session:global:';
var sessionId = isWorker ?
	SESSION_GLOBAL :
	(new URLSearchParams(window.location.search).get('sessionId') || SESSION_GLOBAL);
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
globalThis.bridge = bridge;

(() => {
	// 二重実行を抑制する
	if (globalThis.nooklogBridgeLoaded)
		return;

	globalThis.nooklogBridgeLoaded = true;

	bridge.on('Content:initialize', msg => sessionId = msg.sessionId);

	bridge.on('Nooklog:config', msg => {
		chrome.storage.local.set({ config: msg.config });
	});

	// メッセージを転送する
	bridge.on('Bridge:transfer', msg => {
		chrome.storage.local.set({
			[sessionId + 'message:' + Math.random().toString(36).slice(-8)]: msg,
		});
	}, true);

	// メッセージを受信する
	// (サービスワーカーも起動される)
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local' || !sessionId)
			return;

		for (const [key, { newValue }] of Object.entries(changes)) {
			if (!newValue || !key.includes(':message:'))
				continue;

			// ワーカーなら全て受信、そうでなければ自分宛のみ
			if (isWorker || key.startsWith(sessionId)) {
				const { event, ...msg } = newValue;
				bridge.emit(event, msg);
				chrome.storage.local.remove(key);
			}
		}
	});
})();
