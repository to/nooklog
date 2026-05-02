(() => {
	let previousSelection;
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		const selection = window.getSelection().toString().trim();
		if (selection && selection !== previousSelection) {
			previousSelection = selection;

			if (chrome.runtime?.id)
				chrome.runtime.sendMessage({ type: 'Content:select', selection });
		}
	});
})();
