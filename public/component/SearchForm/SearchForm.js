class SearchForm extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			query: this.$('input[name=query]'),
			from: this.$('input[name=from]'),
			to: this.$('input[name=to]'),
			url: this.$('input[name=url]'),
			loading: this.$('.loading'),
			tags: this.$('nl-tag-input'),
			fields: this.$$('input[name=field]'),
			mode: this.$$('input[name=mode]'),
			vectorMode: this.$('input[name=mode][value=vector]'),
			useVectorIndex: this.$$('input[name=useVectorIndex]'),
			sortBy: this.$$('input[name=sortBy]'),
			count: this.$('.count'),
			prevTerm: this.$('.prevTerm'),
			nextTerm: this.$('.nextTerm'),
		};

		this.els.query.focus();
	}

	async ready() {
		// Wait for the tag whitelist to load for proper auto-completion
		this.els.tags.hub.on('refresh', () => {
			this.setQuery(getSearchParams());
			this._search();

			this._updateVisibility();
			this._updateVectorOptionsVisibility();
		});
	}

	bindEvents() {
		hub.on('Nooklog:updateConfig', () => {
			this._updateVisibility();
		});

		hub.on('ResultTable:selectTag', tag => {
			this.els.tags.tagify.addTags([tag]);
		});

		hub.on('ResultTable:selectHost', host => {
			this.els.url.value = host;
			this._search();
		});

		hub.on('ResultTable:selectDate', dateStr => {
			this.els.from.value = dateStr;
			this.els.to.value = dateStr;
			this._search();
		});

		hub.on('ConfigDialog:import', () => {
			this.els.tags.refresh();
			this.clear();
			this._search();
		});

		this.els.tags.on('change', () => this._search());

		$.on(this.els.form, 'keydown', e => {
			if (e.key === 'Escape') {
				this.clear(false);
				this._search();
				return;
			}

			// Only bridge standard text inputs (excludes Tagify, combo boxes, etc.)
			if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
					e.preventDefault();
					e.stopPropagation();

					document.activeElement.blur();
					document.body.dispatchEvent(new KeyboardEvent('keydown', {
						key: e.key,
						bubbles: true,
						altKey: e.altKey,
						ctrlKey: e.ctrlKey,
						shiftKey: e.shiftKey,
						metaKey: e.metaKey,
					}));
				}
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

			if (e.target.name === 'mode')
				this._updateVectorOptionsVisibility();

			if (e.target.name === 'from' || e.target.name === 'to' ||
				e.target.name === 'sortBy' || e.target.name === 'field' ||
				e.target.name === 'mode' || e.target.name === 'useVectorIndex')
				this._search();
		});

		$.on(this.els.prevTerm, 'click', () => this._shiftDate(-1));
		$.on(this.els.nextTerm, 'click', () => this._shiftDate(1));
	}

	clear(full = true) {
		this.els.query.value = '';
		this.els.from.value = '';
		this.els.to.value = '';
		this.els.url.value = '';
		this.els.tags.removeAllTags();
		this.els.count.textContent = '';

		if (full) {
			this.els.fields.forEach(el => el.checked = el.value !== 'markdown');
			const fts = this.els.mode.find(el => el.value === 'fts');
			if (fts)
				fts.checked = true;

			const relevance = this.els.sortBy.find(el => el.value === 'relevance');
			if (relevance)
				relevance.checked = true;
		}
	}

	getQuery(full = false) {
		const tags = this.els.tags.getTags();
		const query = this.els.query.value;
		const from = this.els.from.value;
		const to = this.els.to.value;
		const url = this.els.url.value;
		const modes = this.els.mode.filter(el => el.checked).map(el => el.value);
		const mode = (modes.length === 2 || modes.length === 0) ? 'hybrid' : modes[0];
		const fields = this.els.fields.filter(el => el.checked).map(el => el.value);
		const sortBy = this.els.sortBy.find(el => el.checked)?.value;

		const res = (full || tags.length || query || from || to || url) ? {
			tags,
			query,
			url,
			mode,
			useVectorIndex: this.els.useVectorIndex.find(el => el.checked)?.value === 'true',
			fields,
			sortBy,
		} : {};

		if (from)
			res.from = from;

		if (to)
			res.to = to;

		return res;
	}

	setQuery(ps) {
		let query = ps.query || '';
		let url = ps.url || '';
		let tags = ps.tags || [];
		if (typeof tags === 'string')
			tags = tags.split(',').filter(Boolean);

		query = query
			.replace(/\bu:(\S+)/g, (_, v) => (url = v, ''))
			.replace(/\bt:(\S+)/g, (_, v) => (tags.push(v), ''))
			.trim().replace(/\s+/g, ' ');

		this.els.query.value = query;
		this.els.from.value = ps.from || '';
		this.els.to.value = ps.to || '';
		this.els.url.value = url;

		this.els.tags.load(tags);

		$.check(this.els.mode, ps.mode === 'hybrid' ? ['fts', 'vector'] : ps.mode);
		$.check(this.els.useVectorIndex, (ps.useVectorIndex !== false).toString());
		$.check(this.els.fields, ps.fields);
		$.check(this.els.sortBy, ps.sortBy);

		this._updateVectorOptionsVisibility();
	}

	_updateURL() {
		setSearchParams(this.getQuery(true));
	}

	async _search() {
		this.setQuery(this.getQuery());

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

	_updateVisibility() {
		const vectorEnabled = config['sentence.vector.enabled'];
		const indexEnabled = config['database.useVectorIndex'];

		// Vector Mode Visibility
		this.$('.vector').classList.toggle('invisible', !vectorEnabled);
		if (!vectorEnabled)
			$.check(this.els.mode, 'fts');

		// Deep Search Visibility (Hidden if index is disabled globally)
		$.toggle(this.els.useVectorIndex[0].closest('.radio-flat'), indexEnabled);
		if (!indexEnabled)
			$.check(this.els.useVectorIndex, 'false');

		// Rating Visibility
		const ratingNone = config['client.ratingInputMode'] === 'none';
		const ratingLabel = this.$('label:has([value=rating])');
		$.toggle(ratingLabel, !ratingNone);

		if (ratingNone && ratingLabel.querySelector('input').checked)
			$.check(this.els.sortBy, 'relevance');

		this._updateVectorOptionsVisibility();
	}

	_updateVectorOptionsVisibility() {
		const vectorEnabled = this.els.vectorMode.checked;
		const radioFlat = this.els.useVectorIndex[0].closest('.radio-flat');
		radioFlat.classList.toggle('invisible', !vectorEnabled);
	}

	_shiftDate(dir) {
		const DAY = 86400000;
		const from = this.els.from.value;
		const to = this.els.to.value;

		// Default to 1 day shift if range is not specified
		const step = (from && to)
			? (new Date(to) - new Date(from) + DAY) * dir
			: DAY * dir;

		[this.els.from, this.els.to].forEach(el => {
			if (!el.value)
				return;

			el.value = new Date(new Date(el.value).getTime() + step)
				.toISOString().split('T')[0];
		});

		this._search();
	}
}

customElements.define('nl-search-form', SearchForm);
