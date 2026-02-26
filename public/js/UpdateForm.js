const WINDOW_WIDTH = 500;
const WINDOW_HEIGHT = 480;
const WINDOW_MARGIN = 25;

class UpdateForm {
	constructor() {
		this.els = {
			form: $('#form-update'),
			error: $('#error'),
			detach: $('#btn-detach'),
			close: $('#btn-close'),
			url: $('#url'),
			title: $('#title'),
			rating: $('#rating'),
			memo: $('#memo'),
			tags: $('input[name=tags]'),
			html: $('#html'),
		};
		this.ratingInput = new RatingInput(this.els.rating);
		if (config['client.ratingInputMode'] === 'tags')
			this.ratingInput.hide();

		this.tagInput = new TagInput(this.els.tags);
		this.tagInput.focus();

		this.originalMemo = '';

		this._init();
		this._bindEvents();
	}

	async _init() {
		const ps = getSearchParams();
		this.id = ps.id;
		this._dispatch('command', { event: 'restore' });

		if (ps.url)
			this.els.url.value = ps.url;

		if (ps.title)
			this.els.title.value = ps.title;

		// 既存データを取得する
		try {
			const bookmark = this.id ?
				await Nookmark.getBookmark(this.id) :
				ps.url ?
					await Nookmark.findByUrl(ps.url) : null;

			if (bookmark)
				this._populate(bookmark);
		} catch (err) {
			this.showError(err.message);
		}
	}

	_bindEvents() {
		this.els.detach.addEventListener('click', () => this.detach());
		this.els.close.addEventListener('click', () => this.close());

		document.addEventListener('keydown', async e => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
				await this._handleSubmit();
		});

		if (!isFrame) {
			window.addEventListener('beforeunload', e => {
				// ブラウザのデフォルトメッセージが表示される
				if (this.originalMemo !== this.els.memo.value)
					e.returnValue = 'Changes you made may not be saved.';
			});
		}

		this.els.form.addEventListener('submit', async e => {
			e.preventDefault();
			await this._handleSubmit();
		});

		window.addEventListener('nookmark:receive', ({ detail: msg }) => {
			if (msg.event === 'restore') {
				// HTMLを取得または復元する
				if (msg.html)
					this.els.html.value = msg.html;

				// 編集内容を復元する
				if (msg.memo)
					this.els.memo.value = msg.memo;

				if (msg.rating != null)
					this.ratingInput.setValue(msg.rating);

				if (msg.tags)
					this.tagInput.setTags(msg.tags);
				return;
			}

			// コンテンツページで新たなテキストが選択されたか？
			if (msg.event === 'select' && this.previousSelection !== msg.selection) {
				this.previousSelection = msg.selection;

				const { selectionStart: start, selectionEnd: end } = this.els.memo;
				const delimiter = (!start || /[／\/、。←→, \.\s]/u.test(
					this.els.memo.value.slice(start - 1, start)))
					? '' : config['extension.selectionDelimiter'];
				this.els.memo.setRangeText(delimiter + msg.selection, start, end, 'end');

				if (config['extension.focusMemoOnSelection'])
					this.els.memo.focus();
				return;
			}
		});
	}

	_populate(bookmark) {
		this.els.url.value = bookmark.url;
		this.els.title.value = bookmark.title;
		this.els.memo.value = bookmark.memo || '';
		this.originalMemo = this.els.memo.value;
		this.ratingInput.setValue(bookmark.rating);
		this.tagInput.setTags(
			[].concat(
				(config['client.ratingInputMode'] === 'tags') ?
					bookmark.rating : [], bookmark.tags || []));
	}

	showError(message) {
		this.els.error.textContent = message;
		this.els.error.classList.remove('none');
	}

	hideError() {
		this.els.error.classList.add('none');
	}

	close() {
		this._dispatch('send', { event: 'close' });
		window.close();
	}

	async detach() {
		// 編集内容を保存する
		this._dispatch('command', {
			event: 'save',
			html: this.els.html.value,
			memo: this.els.memo.value,
			rating: this.ratingInput.getValue(),
			tags: this.tagInput.getTags(),
		});
		this._dispatch('send', { event: 'detach' });
	}

	async _handleSubmit() {
		this.hideError();
		try {
			await Nookmark.updateBookmark({
				id: this.id,
				url: this.els.url.value,
				title: this.els.title.value,
				memo: config['client.normalizeFullWidth']
					? this._normalizeText(this.els.memo.value)
					: this.els.memo.value,
				rating: this.ratingInput.getValue(),
				tags: this.tagInput.getTags(),
				html: this.els.html.value,
			});

			// 編集結果をオリジナルとする(beforeunloadでチェック)
			this.originalMemo = this.els.memo.value;

			this.close();
		} catch (err) {
			this.showError(err.message);
		}
	}

	_dispatch(type, msg = {}) {
		const detail = { ...msg };
		window.dispatchEvent(new CustomEvent(`nookmark:${type}`, { detail }));
	}

	_normalizeText(text) {
		return text
			.replace(/[ 　]+/g, ' ')
			.replace(/（/g, '(')
			.replace(/）/g, ')')
			.replace(/／/g, '/');
	}
}

new UpdateForm();
