class SearchForm extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			query: this.$('input[name=query]'),
			loading: this.$('.loading'),
			tags: this.$('input[name=tags]'),
		};
		this.tagInput = new TagInput(this.els.tags);

		this.els.query.focus();

		const ps = getSearchParams();
		this.els.query.value = ps.query || '';
		this._search();
	}

	bindEvents() {
		hub.on('ResultTable:selectTag', tag => {
			this.tagInput.tagify.addTags([tag]);
		});

		this.tagInput.on('add', () => this._search());
		this.tagInput.on('remove', () => this._search());

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
			// 全てのチェックは外れないように
			if (e.target.name === 'field') {
				const checked = this.$$('input[name="field"]:checked');
				if (checked.length === 0) {
					e.target.checked = true;
					return;
				}
				if (!this.tagInput.getTags().length && !this.els.query.value)
					return;
			}

			// 条件が空で検索対象を変更した場合、検索をスキップする
			if (e.target.name === 'sortBy' || e.target.name === 'field')
				this._search();
		});
	}

	async _search() {
		$.show(this.els.loading);

		const tags = this.tagInput?.getTags();
		const query = this.els.query.value;

		const results = (tags.length || query)
			? await Nooklog.search({
				tags,
				query,
				fields: [...this.$$('input[name=field]:checked')].map(el => el.value),
				sortBy: this.$('input[name="sortBy"]:checked')?.value,
			})
			: await Nooklog.getBookmarks({
				sortBy: this.$('input[name="sortBy"]:checked')?.value,
			});

		hub.emit('SearchForm:search', results);

		$.hide(this.els.loading);
	}
}

customElements.define('nl-search-form', SearchForm);
