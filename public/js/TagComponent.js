class TagComponent {
	constructor(input, options = {}) {
		this.input = input;
		this.maxWhitelist = 7;

		const defaultOptions = {
			maxTags: 20,
			delimiters: ',| ',
			dropdown: {
				enabled: 1, // フォーカス直後に表示しない(フォーカス移動に反応しないように)
				closeOnSelect: true,
				searchKeys: ['value'],
				fuzzySearch: false,
				highlightFirst: true,
			},
		};

		const tagify = new Tagify(this.input, { ...defaultOptions, ...options });
		this.tagify = tagify;

		// IMEをオフにする
		tagify.DOM.input.setAttribute('inputmode', 'url');

		// タブキーで確定する
		tagify.on('keydown', e => {
			if (e.detail.event.key === 'Tab')
				this.enter();
		});

		// タグをクリックして削除する
		tagify.on('click', e => {
			tagify.removeTags(e.detail.tag);
		});

		tagify.dropdown.filterListItems = value => {
			if (!value)
				return tagify.whitelist;

			const regex = new RegExp(
				`^${[...value].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}`, 'i');

			const whitelist = tagify.whitelist
				.filter(t => regex.test(t))
				.sort((a, b) => (b.startsWith(value) - a.startsWith(value)) || (a.length - b.length))
				.slice(0, this.maxWhitelist);

			// 候補が1つだけになったら自動的に確定して閉じる
			if (whitelist.length == 1)
				setTimeout(() => this.enter(), 16);

			return whitelist;
		};
	}

	enter() {
		this.tagify.DOM.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	}

	setTags(tags) {
		this.tagify.addTags(tags);
	}

	getTags() {
		return this.tagify.value.map(t => t.value);
	}

	focus() {
		this.tagify.DOM.input.focus();
	}
}

window.TagComponent = TagComponent;
