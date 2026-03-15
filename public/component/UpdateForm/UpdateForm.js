class UpdateForm extends Component {

	// ユーザー編集が行われたことを表すマーク
	static USER_MARK = '\u200B';

	async initialize() {
		this.els = {
			form: this.$('form'),
			detach: this.$('button.detach'),
			close: this.$('button.close'),
			id: this.$('[name=id]'),
			url: this.$('[name=url]'),
			title: this.$('[name=title]'),
			rating: this.$('nl-rating'),
			memo: this.$('[name=memo]'),
			markdown: this.$('[name=markdown]'),
			tags: this.$('nl-tag-input'),
			html: this.$('[name=html]'),
			preview: this.$('div.preview'),
			modes: this.$$('[name=mode]'),
			submit: this.$('button[type=submit]'),
		};

		this.resizeHandle = new ResizeHandle(this.els.memo, {
			min: 48,
			key: 'UpdateForm.memoHeight',
			size: '3lh',
		});

		this.bookmark = {};
		this.closeOnSave = true;
		this.mode = app.get('UpdateForm.mode', 'memo');
		this.isMini = null;

		this.setSubmitting(false);

		this.setBookmark(getSearchParams());

		bridge.emit('UpdateForm:restore');
	}

	ready() {
		this.els.rating.toggle(
			config['client.ratingInputMode'] !== 'tags');
		this.els.tags.focus();
	}

	bindEvents() {
		$.on(this.els.detach, 'click', () => this.detach());
		$.on(this.els.close, 'click', () => this.close());

		hub.on('ResultTable:select', bookmark => {
			this.closeOnSave = false;
			this.clear();
			this.setBookmark(bookmark);
		});

		bridge.on('Bridge:restore:empty', () => this.fetch());

		bridge.on('Bridge:restore:bookmark', b => this.setBookmark(b));

		bridge.on('Bridge:restore:html', html => {
			this.setBookmark(html);
			this.fetch();
			Nooklog.generateMarkdown(this.getBookmark())
				.then(markdown => this.setBookmark(markdown));
		});

		bridge.on('Content:select', msg => {
			// 選択されたテキストをテキストエリアへ挿入する
			const { selectionStart: start, selectionEnd: end, value } = this.els.memo;

			const delimiter = config['extension.selectionDelimiter'];
			const noBefore = !start || /[／\/、。←→,\.\s（\(「]/.test(value.slice(start - 1, start));
			const noAfter = (end === value.length) || /[／\/、。,\)）」]/.test(value.slice(end, end + 1));
			this.els.memo.setRangeText(
				(noBefore ? '' : delimiter) + msg.selection + (noAfter ? '' : delimiter),
				start, end, 'end');

			if (config['extension.focusMemoOnSelection'])
				this.els.memo.focus();
		});

		$.on(document, 'keydown', async e => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
				await this._handleSubmit();
		});

		$.on(this.els.form, 'submit', async e => {
			e.preventDefault();
			await this._handleSubmit();
		});

		if (!isFrame) {
			$.on(window, 'beforeunload', e => {
				if (this.isChanged()) {
					// ブラウザのデフォルトメッセージが表示される
					e.returnValue = 'Changes you made may not be saved.';
				}
			});
		}

		this.els.modes.forEach(el => {
			$.on(el, 'change', () => this.setMode(el.value));
		});

		$.observeResize(this.els.form, entry => {
			// 表示開始時に高さ0で呼び出される
			const height = entry.contentRect.height;
			const isMini = height <= 360;
			if (!height || this.isMini === isMini)
				return;

			this.isMini = isMini;
			this.classList.toggle('mini', isMini);

			$.toggle(this.$('label:has([value=memo])'), isMini);
			$.toggle(this.$('label:has([value=preview])'), !isMini);

			this.setMode(this.mode, true);
		});
	}

	setMode(mode, force = false) {
		if (!force && this.mode === mode)
			return;

		const from = this.mode;
		let to = mode;
		if ((this.isMini && to === 'preview') || (!this.isMini && to === 'memo'))
			to = 'markdown';

		this.mode = to;
		app.set('UpdateForm.mode', to);

		const fromEl = this.els[from];
		const toEl = this.els[to];
		const ratio = fromEl.scrollTop / (fromEl.scrollHeight - fromEl.clientHeight || 1);

		$.show(this.els.memo, true);
		(this.isMini ? ['memo', 'markdown'] : ['preview', 'markdown'])
			.forEach(mode => $.toggle(this.els[mode], mode === to));
		this.els.modes.forEach(el => el.checked = (el.value === to));

		this.resizeHandle.toggle(!this.isMini);

		if (to === 'preview')
			this.updatePreview();

		if (to !== 'memo' && from !== 'memo')
			toEl.scrollTop = ratio * (toEl.scrollHeight - toEl.clientHeight);
	}

	updatePreview() {
		this.els.preview.innerHTML = app.renderMarkdown(this.els.markdown.value);
	}

	fetch() {
		Nooklog.resolve(this.getBookmark())
			.then(b => this.setBookmark(b))
			.catch(e => app.error(e));
	}

	clear() {
		['id', 'url', 'title', 'rating', 'memo', 'markdown', 'html'].forEach(k => {
			this.els[k].value = '';
		});
		this.els.tags.setTags([]);
		this.bookmark = {};
	}

	// リクエストパラメーター/HTML/編集途中データ/Madkdown/既存データ が集積される
	setBookmark(bookmark) {
		if (!bookmark)
			return;

		// ユーザ編集データ > 現在データ > 旧データ の優先順位で上書きする
		// (idがあるもの = 既存データ)
		if (bookmark.markdown) {
			if (!this.els.markdown.value || this.isEdited(bookmark.markdown) || !bookmark.id)
				this.els.markdown.value = bookmark.markdown;
		}

		['id', 'url', 'title', 'rating', 'memo', 'html'].forEach(k => {
			if (bookmark[k] != null)
				this.els[k].value = bookmark[k];
		});
		if (bookmark.tags || bookmark.rating) {
			this.els.tags.setTags(
				(config['client.ratingInputMode'] === 'tags') && bookmark.rating,
				bookmark.tags);
		}

		this.bookmark = this.getBookmark();

		if (bookmark.markdown != null)
			this.updatePreview();
	}

	getBookmark() {
		return {
			id: this.els.id.value,
			url: this.els.url.value,
			title: this.els.title.value,
			memo: config['client.normalizeFullWidth']
				? this._normalizeText(this.els.memo.value)
				: this.els.memo.value,
			rating: this.els.rating.value,
			tags: this.els.tags.getTags(),
			markdown: this.els.markdown.value,
			html: this.els.html.value,
		};
	}

	isChanged() {
		const bookmark = this.getBookmark();
		return this.bookmark && ['memo', 'markdown', 'tags', 'title'].some(k =>
			(this.bookmark[k] ? `${this.bookmark[k]}` : '') !==
			(bookmark[k] ? `${bookmark[k]}` : ''));
	}

	setSubmitting(active) {
		this.isSubmitting = active;
		this.els.submit.disabled = active;
	}

	close() {
		bridge.emit('UpdateForm:close', {}, true);
		if (this.closeOnSave)
			window.close();
		else
			app.notify('Saved');
	}

	async detach() {
		// 編集内容を保存する
		bridge.emit('UpdateForm:save:bookmark', this.getBookmark());
		bridge.emit('UpdateForm:detach', {}, true);
	}

	async _handleSubmit() {
		if (this.isSubmitting)
			return;

		this.setSubmitting(true);

		const data = this.getBookmark();

		// ユーザーによる修正が行われたことを記録する
		if (data.markdown !== this.bookmark.markdown)
			data.markdown = this.setEdited(data.markdown);

		const bookmark = await Nooklog.updateBookmark(data);
		this.setSubmitting(false);

		if (!bookmark)
			return;

		// 保存内容を最新のオリジナルとする(beforeunloadでチェック)
		// (サーバーからの戻り値はタグに差異が生じる)
		this.bookmark = data;

		hub.emit('UpdateForm:save', bookmark);
		this.close();
	}

	setEdited(markdown) {
		return markdown.replace(
			new RegExp(`${UpdateForm.USER_MARK}?$`),
			UpdateForm.USER_MARK);
	}

	isEdited(markdown) {
		return markdown && markdown.endsWith(UpdateForm.USER_MARK) && (markdown.length > 1);
	}

	_normalizeText(text) {
		return text
			.replace(/[ 　]+/g, ' ')
			.replace(/（/g, '(')
			.replace(/）/g, ')')
			.replace(/／/g, '/');
	}
}

customElements.define('nl-update-form', UpdateForm);
