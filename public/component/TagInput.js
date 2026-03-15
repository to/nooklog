class TagInput extends Component {
	initialize() {
		this.innerHTML = `<input name="${this.getAttribute('name')}"
			placeholder="${this.getAttribute('placeholder') || ''}" class="flex-1">`;
		this.input = this.$('input');
		this.style.display = 'contents';

		this.maxWhitelist = 7;

		const tagify = new Tagify(this.input, {
			maxTags: 20,
			delimiters: ',| ',
			dropdown: {
				enabled: 1, // フォーカス直後に表示しない(フォーカス移動に反応しないように)
				closeOnSelect: true,
				searchKeys: ['value'],
				fuzzySearch: config['client.tagMatchMode'] === 'contains',
				highlightFirst: true,
				maxItems: this.maxWhitelist,
			},
		});
		this.tagify = tagify;
		this.refresh();

		// IMEをオフにする
		tagify.DOM.input.setAttribute('inputmode', 'url');

		// タブキーで確定する
		tagify.on('keydown', e => {
			if (e.detail.event.key === 'Tab')
				this.enter();
		});

		// 入力中はドロップダウンがマウスを無視するように
		const resetInputtingState = debounce(() => {
			tagify.DOM.dropdown.classList.remove('is-inputting');
		}, 500);

		tagify.on('input', () => {
			tagify.DOM.dropdown.classList.add('is-inputting');
			resetInputtingState();
		});

		// タグをクリックして削除する
		tagify.on('click', e => {
			tagify.removeTags(e.detail.tag);
		});
	}

	ready() {
		this.tagify.settings.dropdown.fuzzySearch = config['client.tagMatchMode'] === 'contains';

		if (config['client.tagMatchMode'] === 'smart') {
			this.tagify.dropdown.filterListItems = value => {
				if (!value)
					return this.tagify.whitelist.slice(0, this.maxWhitelist);

				const regex = new RegExp(
					`^${[...value].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}`, 'i');

				const whitelist = this.tagify.whitelist
					.filter(t => regex.test(t))
					.sort((a, b) => (b.startsWith(value) - a.startsWith(value)) || (a.length - b.length))
					.slice(0, this.maxWhitelist);

				// 要素が十分に絞られたら自動的に確定して閉じる
				if (config['client.autoCompleteTags'] &&
					(whitelist.length == 1 || whitelist.filter(t => t.startsWith(value)).length == 1))
					setTimeout(() => this.enter(), 16);

				return whitelist;
			};
		}
	}

	refresh() {
		Nooklog.getTags().then(tags => this.tagify.whitelist = tags);
	}

	enter() {
		this.tagify.DOM.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	}

	setTags(...args) {
		this.tagify.removeAllTags();

		// 重複タグを取り除き適切なレートを決定する
		// (別ウィンドウ切り離し時のデータ混合を修正する)
		const { tags, rating } = Nooklog.separateRating(
			[].concat(...args.filter(v => v)));
		this.tagify.addTags([...new Set([].concat(rating || [], tags))]);
	}

	getTags() {
		return this.tagify.value.map(t => t.value);
	}

	focus() {
		this.tagify.DOM.input.focus();
	}

	on(name, fn) {
		this.tagify.on(name, fn);
		return this;
	}
}

customElements.define('nl-tag-input', TagInput);
