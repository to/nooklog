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

		this._bindEvents();
		this._init();
	}

	async _init() {
		const ps = getSearchParams();
		this.id = ps.id;

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
			if (e.ctrlKey && e.key === 'Enter')
				await this._handleSubmit();
		});
	}

	async _handleSubmit() {
		this.hideError();
		try {
			await Nookmark.updateBookmark({
				id: this.id,
				url: this.els.url.value,
				title: this.els.title.value,
				memo: this.els.memo.value,
				tags: this.tagInput.getTags(),
				html: this.els.html.value,
			});
			window.close();
		} catch (err) {
			this.showError(err.message);
		}
	}
}

new UpdateForm();
