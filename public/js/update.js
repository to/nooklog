class UpdateFormComponent {
	constructor(nookmark) {
		this.nookmark = nookmark;
		this.id = new URLSearchParams(location.search).get('id');
		if (!this.id)
			return;

		this.els = {
			form: $('#updateForm'),
			error: $('#error'),
			url: $('#url'),
			title: $('#title'),
			memo: $('#memo'),
			tags: $('input[name=tags]'),
		};

		this._bindEvents();
		this._init();
	}

	async _init() {
		try {
			const [tags, bookmark] = await Promise.all([
				this.nookmark.getTags(),
				this.nookmark.getBookmark(this.id),
			]);

			this.tagComponent = new TagComponent(this.els.tags, {
				whitelist: tags,
			});

			this._populateForm(bookmark);
		} catch (err) {
			this.showError(err.message);
		}
	}

	_populateForm(bookmark) {
		this.els.url.value = bookmark.url;
		this.els.title.value = bookmark.title;
		this.els.memo.value = bookmark.memo || '';
		this.tagComponent.setTags(
			[].concat(bookmark.rating || [], bookmark.tags || []));

		this.tagComponent.focus();
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
			if (e.ctrlKey && e.key === 'Enter')
				await this._handleSubmit();
		});
	}

	async _handleSubmit() {
		this.hideError();
		try {
			await this.nookmark.updateBookmark({
				id: this.id,
				title: this.els.title.value,
				memo: this.els.memo.value,
				tags: this.tagComponent.getTags(),
			});
			window.close();
		} catch (err) {
			this.showError(err.message);
		}
	}
}

new UpdateFormComponent(new Nookmark());
