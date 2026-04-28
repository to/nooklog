class SearchForm extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			query: this.$('input[name=query]'),
			url: this.$('input[name=url]'),
			loading: this.$('.loading'),
			tags: this.$('nl-tag-input'),
			fields: this.$$('input[name=field]'),
			mode: this.$$('input[name=mode]'),
			deep: this.$('input[name=deep]'),
			sortBy: this.$$('input[name=sortBy]'),
			count: this.$('.count'),
		};

		this.els.query.focus();

		this.setQuery(getSearchParams());
		this._search();
	}

	async ready() {
		this._updateVectorVisibility();
		this._updateRatingVisibility();
	}

	bindEvents() {
		hub.on('Nooklog:updateConfig', () => {
			this._updateVectorVisibility();
			this._updateRatingVisibility();
		});

		hub.on('ResultTable:selectTag', tag => {
			this.els.tags.tagify.addTags([tag]);
		});

		hub.on('ResultTable:selectHost', host => {
			this.els.url.value = host;
			this._search();
		});

		hub.on('ConfigDialog:import', () => {
			this.els.tags.refresh();
			this.clear();
			this._search();
		});

		this.els.tags.on('add', () => this._search());
		this.els.tags.on('remove', () => this._search());

		$.on(this.els.form, 'keydown', e => {
			if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('tagify__input'))
				return;

			if (e.key === 'Escape') {
				this.els.query.value = '';
				this.els.url.value = '';
				this.els.tags.removeAllTags();
				this._search();
			}

			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				document.activeElement.blur();
				document.body.dispatchEvent(new KeyboardEvent('keydown', {
					key: e.key,
					bubbles: true,
				}));
			}
		});

		$.on(this.els.form, 'submit', e => {
			e.preventDefault();
			this._search();
		});

		$.on(this.els.form, 'change', e => {
			this._updateURL();

			// Skip search if changing search target with empty condition
			if (e.target.name === 'field') {
				if (isEmpty(this.getQuery()))
					return;
			}

			if (e.target.name === 'sortBy' || e.target.name === 'field' ||
				e.target.name === 'mode' || e.target.name === 'deep')
				this._search();
		});
	}

	clear() {
		this.els.query.value = '';
		this.els.url.value = '';
		this.els.tags.removeAllTags();
		this.els.fields.forEach(el => el.checked = el.value !== 'markdown');
		const fts = this.els.mode.find(el => el.value === 'fts');
		if (fts)
			fts.checked = true;

		const relevance = this.els.sortBy.find(el => el.value === 'relevance');
		if (relevance)
			relevance.checked = true;
		this.els.count.textContent = '';
	}

	getQuery(full = false) {
		const tags = this.els.tags.getTags();
		const query = this.els.query.value;
		const url = this.els.url.value;
		const modes = this.els.mode.filter(el => el.checked).map(el => el.value);
		const mode = (modes.length === 2 || modes.length === 0) ? 'hybrid' : modes[0];
		const fields = this.els.fields.filter(el => el.checked).map(el => el.value);
		const sortBy = this.els.sortBy.find(el => el.checked)?.value;

		return (full || tags.length || query || url) ? {
			tags,
			query,
			url,
			mode,
			useVectorIndex: !this.els.deep.checked,
			fields,
			sortBy,
		} : {};
	}

	setQuery(ps) {
		this.els.query.value = ps.query || '';
		this.els.url.value = ps.url || '';

		// Suppress event
		this.els.tags.tagify.loadOriginalValues(ps.tags);

		$.check(this.els.mode, ps.mode === 'hybrid' ? ['fts', 'vector'] : ps.mode);
		this.els.deep.checked = ps.useVectorIndex === false;
		$.check(this.els.fields, ps.fields);
		$.check(this.els.sortBy, ps.sortBy);
	}

	_updateURL() {
		setSearchParams(this.getQuery(true));
	}

	async _search() {
		$.hide(this.els.count);
		$.show(this.els.loading);

		this._updateURL();

		const query = this.getQuery();
		const res = isEmpty(query)
			? await Nooklog.search({
				sortBy: this.els.sortBy.find(el => el.checked)?.value,
				limit: 100,
			})
			: await Nooklog.search(query);
		if (!res)
			return;

		res.query = query;

		this.els.count.innerHTML = '<span class="icon">bookmark</span>' + (
			(res.count === 0) ? '0' :
				(res.bookmarks.length !== res.count ?
					`${res.bookmarks.length} / ${res.count}` : `${res.count}+`));

		$.hide(this.els.loading);
		$.show(this.els.count);

		hub.emit('SearchForm:search', res);
	}

	_updateVectorVisibility() {
		this.$('.vector').classList.toggle(
			'invisible', !config['sentence.vector.enabled']);
		if (!config['sentence.vector.enabled'])
			$.check(this.els.mode, 'fts');
	}

	_updateRatingVisibility() {
		const isNone = config['client.ratingInputMode'] === 'none';
		const label = this.$('label:has([value=rating])');
		$.toggle(label, !isNone);

		if (isNone && label.querySelector('input').checked)
			$.check(this.els.sortBy, 'relevance');
	}
}

customElements.define('nl-search-form', SearchForm);
