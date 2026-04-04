(async () => {
	const { config = {} } = await chrome.storage.local.get('config');
	// 二重実行を抑制する
	const HOST_ID = 'nooklog-shadow-host';
	if (document.getElementById(HOST_ID))
		return;

	// スクリプトコンテキストスコープのセッションIDを更新する
	let sessionId = 'session:' + Date.now() + ':';
	bridge.emit('Content:initialize', { sessionId });

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
		width: '320px',
		height: '320px',
		border: 'none',
		zIndex: '2147483647',
		borderRadius: '5px',
		boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
	});

	// 拡張機能内のページを仲介しiframe埋め込み警告を回避する
	// セッションIDを共有する
	const serverUrl = `${config['extension.serverAddress']}/update.html`
		+ `?url=${encodeURIComponent(location.href)}`
		+ `&title=${encodeURIComponent(document.title)}`
		+ `&sessionId=${sessionId}`
		+ '&embed=true';
	iframe.src = chrome.runtime.getURL('content/frame.html') + `?src=${encodeURIComponent(serverUrl)}&sessionId=${sessionId}`;

	const shadow = host.attachShadow({ mode: 'open' });
	shadow.appendChild(iframe);

	// HTMLをサーバーへ保存する
	// (セキュリティを回避するためバックグラウンドワーカーへ依頼する)
	bridge.emit('Content:stash', {
		url: location.href,
		title: document.title,
		html: document.documentElement.outerHTML,
	}, true);

	// テキスト選択を監視する
	let previousSelection;
	const handleSelection = e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection && selection !== previousSelection) {
			previousSelection = selection;
			bridge.emit('Content:select', { selection }, true);
		}
	};

	if (config['extension.autoAppendSelection'] !== false)
		document.addEventListener('mouseup', handleSelection);

	// 別ウィンドウが開く余裕を作る
	const closeHost = () => setTimeout(() => host.remove(), 32);
	bridge.on('UpdateForm:detach', closeHost);
	bridge.on('UpdateForm:close', () => {
		document.removeEventListener('mouseup', handleSelection);
		closeHost();
	});
})();
