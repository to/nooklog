(() => {
	const HOST_ID = 'nookmark-shadow-host';
	if (document.getElementById(HOST_ID))
		return;

	const sessionId = '' + Date.now();

	const host = document.createElement('div');
	host.id = HOST_ID;
	document.body.appendChild(host);

	const iframe = document.createElement('iframe');
	iframe.src = chrome.runtime.getURL('public/update.html')
		+ `?url=${encodeURIComponent(location.href)}`
		+ `&title=${encodeURIComponent(document.title)}`
		+ `&sessionId=${sessionId}`;

	Object.assign(iframe.style, {
		position: 'fixed',
		top: '4px',
		right: '4px',
		width: '300px',
		height: '380px',
		border: 'none',
		zIndex: '2147483647',
		borderRadius: '4px',
		boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
	});

	const shadow = host.attachShadow({ mode: 'open' });
	shadow.appendChild(iframe);

	chrome.storage.local.set({
		['session:' + sessionId + ':html']: document.documentElement.outerHTML,
	});

	// テキスト選択を監視する
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection)
			chrome.runtime.sendMessage({ sessionId, selection });
	});

	window.addEventListener('message', function listener(e) {
		if (e.data.type === 'close') {
			window.removeEventListener('message', listener);
			host.remove();
		}
	});
})();
