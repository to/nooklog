class ResultTable extends Component {
	bindEvents() {
		this._updateRatingVisibility();

		hub.on('Nooklog:updateConfig', () => this._updateRatingVisibility());

		hub.on('SearchForm:search', res => {
			this._render(res.bookmarks);

			if (res.bookmarks.length) {
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

		hub.on('UpdateForm:delete', ({ id }) => {
			this.$(`.tr[data-id="${id}"]`)?.remove();
		});

		this.addEventListener('change', e => {
			const el = e.target.closest('nl-rating');
			if (!el)
				return;

			const id = el.closest('.tr').dataset.id;
			Nooklog.save({ id, rating: el.value });
		});

		$.on(this, 'click', e => {
			if (window.getSelection().toString())
				return;

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
				else if (button.classList.contains('host'))
					hub.emit('ResultTable:selectHost', button.querySelector('img').title);
				return;
			}

			const link = e.target.closest('.title');
			if (!link)
				this._select(row);
		});

		$.on(window, 'keydown', e => {
			const isBody = e.target === document.body;
			const isAlt = e.altKey;
			const isCtrl = e.ctrlKey;

			let dir = null;
			if (isBody && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))
				dir = e.key === 'ArrowDown' ? 'next' : 'previous';
			else if (isAlt && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))
				dir = e.key === 'ArrowDown' ? 'next' : 'previous';
			else if (isCtrl && (e.key === 'j' || e.key === 'k'))
				dir = e.key === 'j' ? 'next' : 'previous';

			if (dir) {
				e.preventDefault();

				const current = this.$('.tr.is-selected');
				const target = current
					? current[dir + 'ElementSibling']
					: this.$('.tr');

				if (target) {
					this._select(target);

					const viewTarget = target[dir + 'ElementSibling']?.[dir + 'ElementSibling'] || target;
					viewTarget.scrollIntoView({ block: 'nearest' });
				}
			}
		});
	}

	async _select(row) {
		const isSelected = row?.classList.contains('is-selected');
		this.$('.tr.is-selected')?.classList.remove('is-selected');
		if (!row || isSelected) {
			app.set('ResultTable.select', false);
			hub.emit('ResultTable:select', null);
			return;
		}

		row.classList.add('is-selected');

		const id = row.dataset.id;
		const bookmark = await Nooklog.find({ id });
		app.set('ResultTable.select', true);
		hub.emit('ResultTable:select', bookmark);
	}

	_render(res) {
		this.innerHTML = res.map(r => this._getRowHTML(r)).join('');
	}

	_getRowHTML(r) {
		const updatedAt = r.updated_at.toISOString().split('T')[0];
		const createdAt = r.created_at.toISOString().split('T')[0];
		const host = this._getHostname(r.url);
		return /* html */`
		<div class="tr" data-id="${r.id}">
			<div class="td col-rating ${config['client.ratingInputMode'] === 'none' ? 'none' : ''}">
				<nl-rating data-rating="${r.rating}"></nl-rating>
			</div>
			<div class="td col-favicon">
				<button class="host flat"><img src="/api/favicon?domain=${host}" title="${host}"></button>
			</div>
			<div class="td col-content">
				<div class="flex flex-col h-full gap-2s">
					<div>
						<a href="${r.url}" target="_blank" rel="noopener noreferrer" class="title">${sanitize(r.title) || ' [No Title]'}</a>
					</div>
					${r.summary ? `<div class="summary">${sanitize(r.summary)}</div>` : ''}
					<div class="memo">${sanitize(r.memo || '')}</div>
					${r.chunk && r.chunkField == 'markdown' ?
				`<div class="chunk">${sanitize(r.chunk.replace(/\n\n+/g, '\n')
					.replace(/^((?:.*\n){4}.*)(?:\n[\s\S]*)?$/, '$1').slice(0, 200))}</div>` : ''}
					<div class="flex justify-end items-end gap-s mt-auto">
						<div class="tags flex flex-wrap gap-s">
							${(r.tags || []).map(t => `<button class="tag flat">${t}</button>`).join('')}
						</div>
						${r.score !== undefined ?
				`<span class="score hidden">${r.score.toFixed(2)}</span>` : ''}
						<span class="dates" title="Created: ${createdAt}">${updatedAt}</span>
						<button class="delete flat icon ${config['server.mode'] === 'readonly' ? 'none' : ''}">delete</button>
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
		if (await Nooklog.delete(id))
			row.remove();
	}

	_getHostname(url) {
		try {
			return new URL(url).hostname;
		} catch {
			return '';
		}
	}

	_updateRatingVisibility() {
		const isNone = config['client.ratingInputMode'] === 'none';
		this.$$('.col-rating').forEach(el => $.toggle(el, !isNone));
	}
}

customElements.define('nl-result-table', ResultTable);
