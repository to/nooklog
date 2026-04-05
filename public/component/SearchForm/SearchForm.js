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
			sortBy: this.$$('input[name=sortBy]'),
			count: this.$('.count'),
		};

		this.els.query.focus();

		this.setQuery(getSearchParams());
		this._search();
	}

	async ready() {
		this._updateVectorVisibility();
	}

	bindEvents() {
		hub.on('Nooklog:saveConfig', () => this._updateVectorVisibility());
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
			if (e.target.tagName !== 'INPUT')
				return;

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

			// 条件が空で検索対象を変更した場合、検索をスキップする
			if (e.target.name === 'field') {
				if (isEmpty(this.getQuery()))
					return;
			}

			if (e.target.name === 'sortBy' || e.target.name === 'field' || e.target.name === 'mode')
				this._search();
		});
	}

	clear() {
		this.els.query.value = '';
		this.els.url.value = '';
		this.els.tags.tagify.removeAllTags();
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
			fields,
			sortBy,
		} : {};
	}

	setQuery(ps) {
		this.els.query.value = ps.query || '';
		this.els.url.value = ps.url || '';

		this.els.tags.tagify.removeAllTags();
		if (ps.tags) {
			const tags = typeof ps.tags === 'string' ? ps.tags.split(',') : ps.tags;
			this.els.tags.tagify.addTags(tags);
		}

		$.check(this.els.mode, ps.mode === 'hybrid' ? ['fts', 'vector'] : ps.mode);
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
		const results = isEmpty(query)
			? await Nooklog.search({
				sortBy: this.els.sortBy.find(el => el.checked)?.value,
				limit: 100,
			})
			: await Nooklog.search(query);
		results.query = query;

		this.els.count.innerHTML = '<span class="icon">bookmark</span>' + (
			(results.count === 0) ? '0' :
				(results.bookmarks.length !== results.count ?
					`${results.bookmarks.length} / ${results.count}` : `${results.count}+`));

		$.hide(this.els.loading);
		$.show(this.els.count);

		hub.emit('SearchForm:search', results);
	}

	_updateVectorVisibility() {
		const isNone = config['sentence.provider'] === 'none';
		this.$('input[name=mode]').parentElement.parentElement.classList.toggle('invisible', isNone);
		if (isNone)
			$.check(this.els.mode, 'fts');
	}
}

customElements.define('nl-search-form', SearchForm);
