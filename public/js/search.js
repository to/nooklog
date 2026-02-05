class SearchPage {
	constructor() {
		this.els = {
			form: document.getElementById('searchForm'),
			query: document.getElementById('query'),
			sortBy: document.getElementById('sortBy'),
			loading: document.getElementById('loading'),
			table: document.getElementById('resultsTable'),
			tbody: document.getElementById('resultsBody'),
			tags: document.querySelector('input[name=tags]'),
		};

		this.updateWindow = null;
		this._bindEvents();
		this._init();
	}

	async _init() {
		const tags = await this._fetchTags();
		this.tagComponent = new TagComponent(this.els.tags, {
			whitelist: tags.sort((a, b) => a.length - b.length || a.localeCompare(b)),
		});

		const params = new URLSearchParams(location.search);
		if (params.get('query'))
			this.els.query.value = params.get('query');

		this._search();
	}

	async _fetchTags() {
		try {
			const res = await fetch('json/tags.json');
			return (await res.json()).tags || [];
		} catch {
			return [];
		}
	}

	_bindEvents() {
		this.els.form.addEventListener('submit', e => {
			e.preventDefault();
			this._search();
		});
	}

	async _search() {
		this.els.loading.style.display = 'block';
		this.els.table.style.display = 'none';

		const fields = [...this.els.form.querySelectorAll('input[name=field]:checked')]
			.map(el => el.value);

		let minRating = null;
		const tags = this.tagComponent.getTags().filter(t => {
			if (!/^\d$/.test(t))
				return true;

			minRating = (t > minRating) ? +t : minRating;
		});

		const params = new URLSearchParams({
			tags: tags.join(','),
			query: this.els.query.value,
			fields: fields.join(','),
			sortBy: this.els.sortBy.value,
			...(minRating != null && { minRating }),
		});

		try {
			const res = await fetch(`/api/search?${params}`);
			const results = await res.json();
			this._render(results);
		} catch (err) {
			this.els.tbody.innerHTML = `<tr><td colspan="3">Error: ${err.message}</td></tr>`;
		}

		this.els.loading.style.display = 'none';
		this.els.table.style.display = 'table';
	}

	_render(results) {
		this.els.tbody.innerHTML = '';

		for (const r of results) {
			const row = document.createElement('tr');
			row.innerHTML = `
				<td class="col-meta">
					<span class="rating">${r.rating || '-'}</span>
					<div class="tags">${(r.tags || []).join(', ')}</div>
					<div class="dates">
						<span>Updated: ${this._formatDate(r.updated_at)}</span>
						<span>Created: ${this._formatDate(r.created_at)}</span>
					</div>
				</td>
				<td class="col-content">
					<a href="${this._escapeHtml(r.url)}" target="_blank" class="title">${this._escapeHtml(r.title)}</a>
					<div class="memo">${this._escapeHtml(r.memo || '')}</div>
				</td>
				<td class="col-actions">
					<button class="btn-edit" data-id="${r.id}">Edit</button>
					<button class="btn-delete" data-id="${r.id}">Delete</button>
				</td>
			`;

			row.querySelector('.btn-edit').addEventListener('click', () => this._openEdit(r.id));
			row.querySelector('.btn-delete').addEventListener('click', e => this._delete(r.id, e.target));

			this.els.tbody.appendChild(row);
		}
	}

	_formatDate(ts) {
		return ts ? new Date(ts).toLocaleDateString() : '-';
	}

	_escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	_openEdit(id) {
		const width = 500, height = 480, margin = 25;
		const left = screen.availWidth - width - (margin + 9);
		const top = screen.availHeight - (height - 10) - margin;

		this.updateWindow = window.open(
			`/update.html?id=${id}`, '_blank',
			`width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1`
		);
	}

	async _delete(id, button) {
		if (!confirm('Are you sure you want to delete this bookmark?'))
			return;

		try {
			const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
			if (!res.ok)
				throw new Error('Delete failed');

			button.closest('tr').remove();
		} catch (err) {
			alert(err.message);
		}
	}
}

new SearchPage();
