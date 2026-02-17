const MEMO_DELIMITER = '/';

class UpdateForm {
	constructor() {
		this.els = {
			form: $('#updateForm'),
			error: $('#error'),
			url: $('#url'),
			title: $('#title'),
			memo: $('#memo'),
			tags: $('input[name=tags]'),
			html: $('#html'),
		};
		this.tagInput = new TagInput(this.els.tags);
		this.tagInput.focus();

		this.originalMemo = '';

		this._init();
		this._bindEvents();
	}

	async _init() {
		const ps = getSearchParams();
		this.id = ps.id;
		this.contentTabId = parseInt(ps.contentTabId, 10);

		if (ps.url)
			this.els.url.value = ps.url;
		if (ps.title)
			this.els.title.value = ps.title;

		try {
			const bookmark =
				this.id ?
					await Nookmark.getBookmark(this.id) :
					ps.url ?
						await Nookmark.findByUrl(ps.url) : null;

			if (bookmark)
				this._populate(bookmark);
		} catch (err) {
			this.showError(err.message);
		}
	}

	_populate(bookmark) {
		this.els.url.value = bookmark.url;
		this.els.title.value = bookmark.title;
		this.els.memo.value = bookmark.memo || '';
		this.originalMemo = this.els.memo.value;
		this.tagInput.setTags(
			[].concat(bookmark.rating || [], bookmark.tags || []));
	}

	showError(message) {
		this.els.error.textContent = message;
		this.els.error.style.display = 'block';
	}

	hideError() {
		this.els.error.style.display = 'none';
	}

	_bindEvents() {
		this.els.form.addEventListener('submit', async e => {
			e.preventDefault();
			await this._handleSubmit();
		});

		document.addEventListener('keydown', async e => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
				await this._handleSubmit();
		});

		window.addEventListener('beforeunload', e => {
			// ブラウザのデフォルトメッセージが表示される
			if (this.originalMemo !== this.els.memo.value)
				e.returnValue = 'Changes you made may not be saved.';
		});

		// 拡張内で開かれているか？
		if (window?.chrome?.runtime) {
			chrome.runtime.onMessage.addListener((msg, sender) => {
				if (sender?.tab?.id !== this.contentTabId)
					return;

				if (msg.html) {
					this.els.html.value = msg.html;
					return;
				}

				if (msg.selection && this.previousSelection !== msg.selection) {
					this.previousSelection = msg.selection;

					const { selectionStart: start, selectionEnd: end } = this.els.memo;
					const delimiter = (!start || /[\p{P}\p{S}\p{Z}]/u.test(
						this.els.memo.value.slice(start - 1, start)))
						? '' : MEMO_DELIMITER;
					this.els.memo.setRangeText(delimiter + msg.selection, start, end, 'end');
					return;
				}
			});

			// 準備ができたことを通知しHTMLを受診する
			chrome.tabs.getCurrent().then(tab => {
				chrome.tabs.sendMessage(this.contentTabId, {
					status: 'ready',
					updateTabId: tab.id,
				});
			});
		}
	}

	async _handleSubmit() {
		this.hideError();
		try {
			await Nookmark.updateBookmark({
				id: this.id,
				url: this.els.url.value,
				title: this.els.title.value,
				memo: this._normalizeText(this.els.memo.value),
				tags: this.tagInput.getTags(),
				html: this.els.html.value,
			});

			// 編集結果をオリジナルとする
			this.originalMemo = this.els.memo.value;
			window.close();
		} catch (err) {
			this.showError(err.message);
		}
	}

	_normalizeText(text) {
		return text
			.replace(/（/g, '(')
			.replace(/）/g, ')')
			.replace(/／/g, '/');
	}
}

new UpdateForm();
