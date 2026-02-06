class TagInput {
	constructor(input) {
		this.input = input;
		this.maxWhitelist = 7;

		const tagify = new Tagify(this.input, {
			maxTags: 20,
			delimiters: ',| ',
			dropdown: {
				enabled: 1, // フォーカス直後に表示しない(フォーカス移動に反応しないように)
				closeOnSelect: true,
				searchKeys: ['value'],
				fuzzySearch: false,
				highlightFirst: true,
			},
		});
		this.tagify = tagify;

		Nookmark.getTags().then(tags => tagify.whitelist = tags);

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

			// 要素が十分に絞られたら自動的に確定して閉じる
			if (whitelist.length == 1 || whitelist.filter(t => t.startsWith(value)).length == 1)
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

window.TagInput = TagInput;
