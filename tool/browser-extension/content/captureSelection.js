(() => {
	let previousSelection;
	document.addEventListener('mouseup', e => {
		if (e.button !== 0)
			return;

		// Selections in input fields like text areas are ignored
		const selection = window.getSelection().toString().trim();
		if (selection && selection !== previousSelection) {
			previousSelection = selection;

			if (chrome.runtime?.id)
				chrome.runtime.sendMessage({ type: 'Content:select', selection });
		}
	});
})();
