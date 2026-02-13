class SearchPage {
	constructor() {
		this.els = {
			form: $('#searchForm'),
			query: $('#query'),

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
		this.tagInput.on('add', () => this._search());
		this.tagInput.on('remove', () => this._search());

		this.els.form.addEventListener('submit', e => {
			e.preventDefault();
			this._search();
		});

		this.els.form.addEventListener('change', e => {
			if (e.target.name === 'field') {
				// 全てのチェックは外れないように
				const checked = $$('input[name="field"]:checked');
				if (checked.length === 0) {
					e.target.checked = true;
					return;
				}

				// 条件が空で検索対象を変更した場合、検索をスキップする
				if (!this.tagInput.getTags().length && !this.els.query.value)
					return;
			}

			if (e.target.name === 'sortBy' || e.target.name === 'field')
				this._search();
		});

		this.els.tbody.addEventListener('click', e => {
			const tag = e.target.closest('.tags span');
			if (tag) {
				this.tagInput.tagify.addTags([tag.textContent]);
				return;
			}

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

		const tags = this.tagInput?.getTags();
		const query = this.els.query.value;
		try {
			const results = (tags.length || query)
				? await Nookmark.search({
					tags,
					query,
					fields: [...$$('input[name=field]:checked')].map(el => el.value),
					sortBy: $('input[name="sortBy"]:checked')?.value,
				})
				: await Nookmark.getBookmarks({
					sortBy: $('input[name="sortBy"]:checked')?.value,
				});

			this._render(results);
		} catch (err) {
			this.els.tbody.innerHTML = `<tr><td colspan="3">Error: ${err.message}</td></tr>`;
		}

		this.els.loading.style.display = 'none';
		this.els.table.style.display = 'table';
	}

	_render(results) {
		this.els.tbody.innerHTML = results.map(r => {
			const createdAt = r.created_at.toISOString().split('T')[0];
			const updatedAt = r.updated_at.toISOString().split('T')[0];
			return `
			<tr>
				<td class="col-rating">
					<span class="rating rating-${r.rating}">${'★'.repeat(r.rating)}</span>
				</td>
				<td class="col-favicon">
					<img src="https://www.google.com/s2/favicons?sz=16&domain=${this._getHostname(r.url)}">
				</td>
				<td class="col-content">
					<div class="flex flex-col h-full gap-2s">
						<a href="${r.url}" target="_blank" rel="noopener noreferrer" class="title">${sanitize(r.title)}</a>
						<div class="memo">${sanitize(r.memo || '')}</div>
						<div class="tags flex flex-wrap gap-2s justify-end mt-auto">
							${(r.tags || []).map(t => `<span class="btn-text">${t}</span>`).join('')}
						</div>
					</div>
				</td>
				<td class="col-actions">
					<div class="flex flex-col gap-s items-end justify-between h-full">
						<div class="flex gap-s">
							<button class="btn-edit btn-flat" data-id="${r.id}"><span class="icon">edit</span></button>
							<button class="btn-delete btn-flat" data-id="${r.id}"><span class="icon">delete</span></button>
						</div>
						<span class="dates">${updatedAt}${createdAt !== updatedAt ? `<br>${createdAt}` : ''}</span>
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
	_getHostname(url) {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
	}
}

new SearchPage();
