(() => {
	let previousSelection;
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		// EN: テキストエリアなどの入力欄の選択は無視される
		const selection = window.getSelection().toString().trim();
		if (selection && selection !== previousSelection) {
			previousSelection = selection;

			if (chrome.runtime?.id)
				chrome.runtime.sendMessage({ type: 'Content:select', selection });
		}
	});
})();
