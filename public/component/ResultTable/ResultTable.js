class ResultTable extends Component {
	bindEvents() {
		hub.on('SearchForm:search', results => {
			this._render(results);

			if (results.length) {
				if (app.get('ResultTable.select', false))
					this._select(this.$('.tr'));
			}
		});

		hub.on('PreviewPanel:close', () => this._select());

		hub.on('UpdateForm:save', bookmark => {
			const row = this.$(`.tr[data-id="${bookmark.id}"]`);
			row.outerHTML = this._getRowHTML(bookmark);
			this.$(`.tr[data-id="${bookmark.id}"]`).classList.add('is-selected');
		});

		this.addEventListener('change', e => {
			const el = e.target.closest('nl-rating');
			if (!el)
				return;

			const id = el.closest('.tr').dataset.id;
			Nooklog.updateBookmark({ id, rating: el.value });
		});

		$.on(this, 'click', e => {
			const row = e.target.closest('.tr');

			const button = e.target.closest('button');
			if (button) {
				const id = row.dataset.id;
				if (button.classList.contains('edit'))
					this._openEdit(id);
				else if (button.classList.contains('delete'))
					this._delete(id, row);
				else if (button.classList.contains('tag'))
					hub.emit('ResultTable:selectTag', button.textContent);
				return;
			}

			const link = e.target.closest('.title');
			if (!link)
				this._select(row);
		});

		$.on(window, 'keydown', e => {
			if (e.target !== document.body)
				return;

			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				const direction = e.key === 'ArrowDown' ? 'next' : 'previous';
				const current = this.$('.tr.is-selected');
				const target = current
					? current[direction + 'ElementSibling']
					: this.firstElementChild;

				if (target) {
					e.preventDefault();
					this._select(target);

					const viewTarget = target[direction + 'ElementSibling']?.[direction + 'ElementSibling'] || target;
					viewTarget.scrollIntoView({ block: 'nearest' });
				}
			}
		});
	}

	async _select(row) {
		this.$('.tr.is-selected')?.classList.remove('is-selected');
		if (!row) {
			app.set('ResultTable.select', false);
			return;
		}

		row.classList.add('is-selected');

		const id = row.dataset.id;
		const bookmark = await Nooklog.getBookmark(id);
		app.set('ResultTable.select', true);
		hub.emit('ResultTable:select', bookmark);
	}

	_render(results) {
		this.innerHTML = results.map(r => this._getRowHTML(r)).join('');
	}

	_getRowHTML(r) {
		const updatedAt = r.updated_at.toISOString().split('T')[0];
		return /* html */`
		<div class="tr" data-id="${r.id}">
			<div class="td col-rating">
				<nl-rating data-rating="${r.rating}"></nl-rating>
			</div>
			<div class="td col-favicon">
				<img src="/api/favicon?domain=${this._getHostname(r.url)}">
			</div>
			<div class="td col-content">
				<div class="flex flex-col h-full gap-2s">
					<div>
						<a href="${r.url}" target="_blank" rel="noopener noreferrer" class="title">${sanitize(r.title)}</a>
					</div>
					<div class="memo">${sanitize(r.memo || '')}</div>
					<div class="flex justify-end items-end gap-s mt-auto">
						<div class="tags flex flex-wrap gap-s">
							${(r.tags || []).map(t => `<button class="tag flat">${t}</button>`).join('')}
						</div>
						<span class="dates">${updatedAt}</span>
						<button class="delete flat icon">delete</button>
					</div>
				</div>
			</div>
		</div>`;
	}

	_openEdit(id) {
		const width = 500;
		const height = 480;
		const left = screen.availLeft + screen.availWidth - width - 30;
		const top = config['client.windowPosition'] === 'top-right'
			? screen.availTop + 8
			: screen.availTop + screen.availHeight - height - 2;
		window.open(
			`/update.html?id=${id}`, '_blank',
			`width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=1,scrollbars=1,resizable=1`,
		);
	}

	async _delete(id, row) {
		if (!confirm('Are you sure you want to delete this bookmark?'))
			return;

		if (await Nooklog.deleteBookmark(id))
			row.remove();
	}

	_getHostname(url) {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
	}
}

customElements.define('nl-result-table', ResultTable);
