(ctx => {
	// Allow coexistence of registerContentScripts and executeScript instances
	const isWorker = typeof window === 'undefined';
	if (isWorker) {
		// Prevent duplicate executions
		if (globalThis['content/bridge.js'])
			return;

		globalThis['content/bridge.js'] = true;

		const listeners = {};
		globalThis.window = {
			addEventListener: (event, listener) => {
				listeners[event] ??= [];
				listeners[event].push(listener);
			},
			dispatchEvent: e => {
				listeners[e.type]?.forEach(l => l(e));
			},
		};
	}

	const ps = isWorker ? null : new URLSearchParams(window.location.search);
	const tabId = ctx?.tabId || Number(ps?.get('tabId') || 0);
	const windowId = ctx?.windowId || Number(ps?.get('windowId') || 0);

	const bridge = {
		on: (event, listner, opt = {}) => {
			window.addEventListener(`Nooklog:${event}`, ({ detail }) => {
				// Is the extension robust and ready?
				if (!chrome.runtime?.id)
					return;

				if (opt.tab && detail.tabId !== tabId)
					return;

				if (opt.window && detail.windowId !== windowId)
					return;

				listner(detail.message, detail);
			});
		},

		emit: (event, msg = {}, opt = {}) => {
			let detail = { message: msg, ...opt };
			if (!opt.local) {
				detail = { event, ...detail };
				event = 'Bridge:transfer';
			}
			window.dispatchEvent(new CustomEvent(`Nooklog:${event}`, { detail }));
		},
	};
	globalThis.bridge = bridge;

	if (!isWorker) {
		// Relay postMessage from iframes as a fallback
		window.addEventListener('message', e => {
			if (e.data?.type === 'Bridge:transfer')
				bridge.emit('Bridge:transfer', e.data.message, { ...e.data, local: true });
		});
	}

	// Forward message
	bridge.on('Bridge:transfer', (_, meta) => {
		// Is the extension robust and ready?
		if (!chrome.runtime?.id)
			return;

		meta.tabId ??= tabId;
		meta.windowId ??= windowId;
		chrome.storage.session.set({
			['bridge:' + Math.random().toString(36).slice(-8)]: meta,
		});
	});

	// Receive message
	// (Service worker also started)
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== 'session')
			return;

		for (const [key, { newValue: v }] of Object.entries(changes)) {
			if (!v || !key.startsWith('bridge:'))
				continue;

			// Events propagate to all listeners even if removed
			chrome.storage.session.remove(key);

			bridge.emit(v.event, v.message, { ...v, local: true });
		}
	});
})(...(globalThis.window?.args || globalThis.args || []));
