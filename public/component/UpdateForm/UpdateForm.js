class UpdateForm extends Component {

	// Mark indicating user modification
	static USER_MARK = '\u200B';

	async initialize() {
		this.els = {
			form: this.$('form'),
			detach: this.$('button.detach'),
			refresh: this.$('button.refresh'),
			close: this.$('button.close'),
			id: this.$('[name=id]'),
			url: this.$('[name=url]'),
			title: this.$('[name=title]'),
			summary: this.$(':has(> [name=summary])'),
			rating: this.$('nl-rating'),
			memo: this.$('[name=memo]'),
			markdown: this.$('[name=markdown]'),
			tags: this.$('nl-tag-input'),
			html: this.$('[name=html]'),
			preview: this.$('div.preview'),
			modes: this.$$('[name=mode]'),
			submit: this.$('button[type=submit]'),
		};

		this.memoResizeHandle = new ResizeHandle(this.els.memo, {
			min: 48,
			key: 'UpdateForm.memoHeight',
			size: '3lh',
		});

		new ResizeHandle(this.els.summary.input, {
			min: 24,
			key: 'UpdateForm.summaryHeight',
			size: '4lh',
		});

		this.bookmark = {};
		this.closeOnSave = true;
		this.mode = app.get('UpdateForm.mode', 'memo');
		this.isMini = null;

		this._setSubmitting(false);

		const ps = getSearchParams();
		this.view = ps.view;

		this.setBookmark(ps);
		this.pop(ps);
	}

	ready() {
		if (config['server.mode'] === 'readonly') {
			$.hide(this.els.submit);
			this.els.memo.readOnly = true;
			this.els.markdown.readOnly = true;
			this.els.title.readOnly = true;
			this.els.url.readOnly = true;
		}

		this.els.rating.toggle(
			['stars', 'both'].includes(config['client.ratingInputMode']));
		this.els.tags.focus();

		const isSidePanel = this.view === 'sidepanel';
		const isEmbed = this.view === 'embed';
		$.toggle(this.els.refresh, isSidePanel);
		$.toggle(this.els.close, isEmbed);
		$.toggle(this.els.detach, isEmbed);
	}

	bindEvents() {
		$.on(this.els.refresh, 'click', () => this.refresh());
		$.on(this.els.detach, 'click', () => this.detach());
		$.on(this.els.close, 'click', () => this.close());

		hub.on('ResultTable:select', bookmark => {
			this.closeOnSave = false;
			this.clear();
			this.setBookmark(bookmark);
		});

		if (this.view === 'sidepanel') {
			this.closeOnSave = config['extension.closeSidepanelOnSave'];

			bridge.on('Background:stashComplete', msg => {
				this.pop(msg);
			}, { window: true });

			const onVisible = () => {
				if (document.visibilityState === 'visible')
					this.refresh();
			};
			onVisible();

			document.addEventListener('visibilitychange', onVisible);
		}

		bridge.on('Content:select', msg => {
			// Insert selected text into text area
			const { selectionStart: start, selectionEnd: end, value } = this.els.memo;

			const delimiter = config['extension.selectionDelimiter'];
			const noBefore = !start || /[／\/、。←→,\.\s（\(「]/.test(value.slice(start - 1, start));
			const noAfter = (end === value.length) || /[／\/、。,\)）」]/.test(value.slice(end, end + 1));
			this.els.memo.setRangeText(
				(noBefore ? '' : delimiter) + msg.selection + (noAfter ? '' : delimiter),
				start, end, 'end');

			if (config['extension.focusMemoOnSelection'])
				this.els.memo.focus();
		}, this.view === 'embed' ? { tab: true } : { window: true });

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
					// Browser's default message is shown
					e.returnValue = 'Changes you made may not be saved.';
				}
			});
		}

		this.els.modes.forEach(el => {
			$.on(el, 'change', () => this.setMode(el.value));
		});

		$.observeResize(this.els.form, entry => {
			// Called with height 0 when showing starts
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
		$.check(this.els.modes, to);

		this.memoResizeHandle.toggle(!this.isMini);

		if (to === 'preview')
			this.updatePreview();

		if (to !== 'memo' && from !== 'memo')
			toEl.scrollTop = ratio * (toEl.scrollHeight - toEl.clientHeight);
	}

	updatePreview() {
		this.els.preview.innerHTML = app.renderMarkdown(this.getBookmark());
	}

	clear() {
		['id', 'url', 'title', 'rating', 'summary', 'memo', 'markdown', 'html'].forEach(k => {
			this.els[k].value = '';
		});
		this.els.tags.setTags([]);
		this.bookmark = {};
	}

	refresh() {
		// TOFIX: 変更チェック
		this.clear();
		bridge.emit('UpdateForm:refresh');
	}

	async pop(ps) {
		// EN: サイドパネルなど空でフォームが開かれたか？
		if (!ps.id && !ps.url)
			return;

		const bookmark = await Nooklog.pop(ps);
		this.setBookmark(bookmark);
	}

	// Request base parameters / existing data / editing data
	setBookmark(bookmark) {
		if (!bookmark)
			return;

		['id', 'url', 'title', 'rating', 'summary', 'memo', 'html', 'markdown'].forEach(k => {
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
			memo: this.els.memo.value,
			rating: this.els.rating.value,
			tags: this.els.tags.getTags(),
			summary: this.els.summary.value,
			markdown: this.els.markdown.value,
			html: this.els.html.value,
		};
	}

	isChanged() {
		const bookmark = this.getBookmark();
		return this.bookmark && ['memo', 'summary', 'markdown', 'tags', 'title'].some(k =>
			(this.bookmark[k] ? `${this.bookmark[k]}` : '') !==
			(bookmark[k] ? `${bookmark[k]}` : ''));
	}

	_setSubmitting(active) {
		this.isSubmitting = active;
		this.els.submit.disabled = active;
	}

	close() {
		if (this.view === 'embed')
			bridge.emit('UpdateForm:closeFrame');

		if (this.closeOnSave) {
			if (this.view === 'sidepanel')
				bridge.emit('UpdateForm:closePanel');

			window.close();
		} else {
			app.notify('Saved');
		}
	}

	async detach() {
		// Save the edited content
		await Nooklog.stash(this.getBookmark());
		bridge.emit('UpdateForm:detach', { url: window.location.href });
	}

	async _handleSubmit() {
		if (this.isSubmitting || config['server.mode'] === 'readonly')
			return;

		this._setSubmitting(true);

		this.setEdited();

		const data = this.getBookmark();

		const bookmark = await Nooklog.save(data);
		this._setSubmitting(false);

		if (!bookmark)
			return;

		// Set saved content as the latest original (checked by beforeunload)
		// (Server response has tag differences)
		this.bookmark = data;

		hub.emit('UpdateForm:save', bookmark);
		bridge.emit('UpdateForm:save', bookmark);
		this.close();
	}

	setEdited() {
		// Record that user modifications were made
		if (this.els.markdown.value !== this.bookmark.markdown) {
			this.els.markdown.value =
				this.els.markdown.value.replaceAll(UpdateForm.USER_MARK, '') +
				UpdateForm.USER_MARK;
		}
	}
}

customElements.define('nl-update-form', UpdateForm);
