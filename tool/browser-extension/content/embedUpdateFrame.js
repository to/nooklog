(async ctx => {
	const { config = {} } = await chrome.storage.local.get('config');

	const host = document.createElement('div');
	document.body.appendChild(host);

	const iframe = document.createElement('iframe');
	const pos = config['client.windowPosition'];
	Object.assign(iframe.style, {
		position: 'fixed',
		top: pos === 'top-right' ? '4px' : 'auto',
		bottom: pos === 'top-right' ? 'auto' : '4px',
		right: '4px',
		width: '320px',
		height: '320px',
		border: 'none',
		zIndex: '2147483647',
		borderRadius: '5px',
		boxShadow: '0 4px 24px rgba(25, 25, 25, 0.3)',
	});

	const url = new URL(`${config['extension.serverAddress']}/update.html`);
	url.searchParams.set('url', location.href);
	url.searchParams.set('title', document.title);
	url.searchParams.set('view', 'embed');
	iframe.src = chrome.runtime.getURL('content/frame.html') +
		`?src=${encodeURIComponent(url.href)}`;

	// Wait for the server to process the stash before showing the UI
	bridge.on('Background:stashComplete', msg => {
		if (msg.url === location.href && !host.shadowRoot) {
			const shadow = host.attachShadow({ mode: 'open' });
			shadow.appendChild(iframe);
		}
	}, { tab: true });

	// Allow adequate time for another window to open
	const closeHost = () => {
		delete window[ctx.scriptId];
		setTimeout(() => host.remove(), 32);
	};
	bridge.on('UpdateForm:detach', closeHost, { tab: true });
	bridge.on('UpdateForm:closeFrame', closeHost, { tab: true });

	return {
		url: location.href,
		title: document.title,
		html: document.documentElement.outerHTML,
	};
})(...window.args);
