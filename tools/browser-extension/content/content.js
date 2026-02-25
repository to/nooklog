(async () => {
	const { config = {} } = await chrome.storage.local.get('config');
	// 二重実行を抑制する
	const HOST_ID = 'nookmark-shadow-host';
	if (document.getElementById(HOST_ID))
		return;

	// スクリプトコンテキストスコープのセッションIDを更新する
	let sessionId = 'session:' + Date.now() + ':';
	dispatch('command', { event: 'initialize', sessionId });

	const host = document.createElement('div');
	host.id = HOST_ID;
	document.body.appendChild(host);

	const iframe = document.createElement('iframe');
	const pos = config['client.windowPosition'];
	Object.assign(iframe.style, {
		position: 'fixed',
		top: pos === 'top-right' ? '4px' : 'auto',
		bottom: pos === 'top-right' ? 'auto' : '4px',
		right: '4px',
		width: '300px',
		height: '380px',
		border: 'none',
		zIndex: '2147483647',
		borderRadius: '5px',
		boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
	});

	// 拡張機能内のページを仲介しiframe埋め込み警告を回避する
	// セッションIDを配布する
	const serverUrl = `${config['extension.serverAddress']}/update.html`
		+ `?url=${encodeURIComponent(location.href)}`
		+ `&title=${encodeURIComponent(document.title)}`
		+ `&sessionId=${sessionId}`;
	iframe.src = chrome.runtime.getURL('content/frame.html') + `?src=${encodeURIComponent(serverUrl)}&sessionId=${sessionId}`;

	const shadow = host.attachShadow({ mode: 'open' });
	shadow.appendChild(iframe);

	// HTMLを保存する(準備ができたときに取得される)
	dispatch('command', {
		event: 'save',
		html: document.documentElement.outerHTML,
	});

	// テキスト選択を監視する
	const handleSelection = e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection)
			dispatch('send', { event: 'select', selection });
	};

	if (config['extension.autoAppendSelection'] !== false)
		document.addEventListener('mouseup', handleSelection);

	window.addEventListener('nookmark:receive', ({ detail: { event } }) => {
		if (event === 'detach' || event === 'close') {
			// ウィンドウが開くのを待つ
			setTimeout(() => {
				host.remove();
			}, 32);
		}

		if (event === 'close')
			document.removeEventListener('mouseup', handleSelection);
	});
})();
