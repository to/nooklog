class SearchPage {
	constructor() {
		this.els = {
			form: $('#searchForm'),
			query: $('#query'),
			sortBy: $('#sortBy'),
			loading: $('#loading'),
			table: $('#resultsTable'),
			tbody: $('#resultsBody'),
			tags: $('input[name=tags]'),
		};
		this.tagInput = new TagInput(this.els.tags);
		this.els.query.focus();

		this._bindEvents();
		this._init();
	}

	async _init() {
		const ps = getSearchParams();
		this.els.query.value = ps.query || '';

		this._search();
	}

	_bindEvents() {
		this.els.form.addEventListener('submit', e => {
			e.preventDefault();
			this._search();
		});

		this.els.tbody.addEventListener('click', e => {
			const button = e.target.closest('button');
			if (!button)
				return;

			const id = button.dataset.id;
			if (button.classList.contains('btn-edit'))
				this._openEdit(id);
			else if (button.classList.contains('btn-delete'))
				this._delete(id, button);
		});
	}

	async _search() {
		this.els.loading.style.display = 'block';
		this.els.table.style.display = 'none';

		const tags = this.tagInput?.getTags() || [];
		const query = this.els.query.value;
		try {
			const results = (tags.length > 0 || query)
				? await Nookmark.search({
					tags,
					query,
					fields: [...$$('input[name=field]:checked')].map(el => el.value),
					sortBy: this.els.sortBy.value,
				})
				: await Nookmark.getBookmarks();

			this._render(results);
		} catch (err) {
			this.els.tbody.innerHTML = `<tr><td colspan="3">Error: ${err.message}</td></tr>`;
		}

		this.els.loading.style.display = 'none';
		this.els.table.style.display = 'table';
	}

	_render(results) {
		this.els.tbody.innerHTML = results.map(r => {
			return html`
			<tr>
				<td class="col-rating">
					<span class="rating rating-${r.rating}">${'★'.repeat(r.rating)}</span>
				</td>
				<td class="col-content">
					<div class="content-wrapper">
						<a href="${r.url}" target="_blank" rel="noopener noreferrer" class="title">${r.title}</a>
						<div class="memo">${r.memo || ''}</div>
						<div class="tags">${(r.tags || []).join(' ')}</div>
					</div>
				</td>
				<td class="col-actions">
					<div class="actions-wrapper">
						<div class="btn-group">
							<button class="btn-edit btn-flat" data-id="${r.id}"><span class="material-symbols-outlined">edit</span></button>
							<button class="btn-delete btn-flat" data-id="${r.id}"><span class="material-symbols-outlined">delete</span></button>
						</div>
						<span class="dates" title="${r.created_at.toLocaleDateString()}">${r.updated_at.toLocaleDateString()}</span>
					</div>
				</td>
			</tr>`;
		}).join('');
	}

	_openEdit(id) {
		const width = 500, height = 480, margin = 25;
		const left = screen.availWidth - width - (margin + 9);
		const top = screen.availHeight - (height - 10) - margin;
		window.open(
			`/update.html?id=${id}`, '_blank',
			`width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1`,
		);
	}

	async _delete(id, button) {
		if (!confirm('Are you sure you want to delete this bookmark?'))
			return;

		try {
			await Nookmark.deleteBookmark(id);
			button.closest('tr').remove();
		} catch (err) {
			alert(err.message);
		}
	}
}

new SearchPage();
