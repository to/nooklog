class Nookmark {
	constructor(apiBase = '/api/bookmarks') {
		this.apiBase = apiBase;
	}

	async getBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');
		return await res.json();
	}

	async getTags() {
		try {
			const res = await fetch('json/tags.json');
			const data = await res.json();
			return data.tags || [];
		} catch (err) {
			console.error('Failed to load tags.json:', err);
			return [];
		}
	}

	async updateBookmark(bookmark) {
		// 数値だけのタグの中で最大のものをレートとする
		let rating = null;
		const tags = bookmark.tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;

			rating = (t > rating) ? +t : rating;
		});

		const res = await fetch(`${this.apiBase}/${bookmark.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: bookmark.title,
				memo: bookmark.memo,
				tags: tags,
				rating: rating,
			}),
		});

		if (!res.ok)
			throw new Error('Update failed');
	}
}

class UpdateFormComponent {
	constructor(nookmark) {
		this.nookmark = nookmark;
		this.els = {
			form: document.getElementById('updateForm'),
			error: document.getElementById('error'),
			url: document.getElementById('url'),
			title: document.getElementById('title'),
			memo: document.getElementById('memo'),
			tags: document.querySelector('input[name=tags]'),
		};

		this._bindEvents();
	}

	async init(id) {
		this.id = id;

		try {
			// タグとブックマークを並列で取得する
			const [tags, bookmark] = await Promise.all([
				this.nookmark.getTags(),
				this.nookmark.getBookmark(id),
			]);

			this.tagComponent = new TagComponent(this.els.tags, {
				whitelist: tags.sort((a, b) => a.length - b.length || a.localeCompare(b)),
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

		// Ctrl+Enter ショートカット
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

(async () => {
	const nookmark = new Nookmark();
	const formComponent = new UpdateFormComponent(nookmark);
	formComponent.init(
		new URLSearchParams(location.search).get('id'));
})();
