class TagComponent {
	constructor(input, options = {}) {
		this.input = input;

		const defaultOptions = {
			maxTags: 20,
			delimiters: ',| ',
			dropdown: {
				enabled: 1, // フォーカス直後に表示しない(フォーカス移動に反応しないように)
				closeOnSelect: true,
				searchKeys: ['value'],
				fuzzySearch: false,
			},
		};

		const tagify = new Tagify(this.input, { ...defaultOptions, ...options });
		this.tagify = tagify;

		// タブキーで確定する
		tagify.on('keydown', e => {
			if (e.detail.event.key === 'Tab') {
				const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
				tagify.DOM.input.dispatchEvent(event);
			}
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

			return tagify.whitelist
				.filter(t => regex.test(t))
				.sort((a, b) => (b.startsWith(value) - a.startsWith(value)) || (a.length - b.length));
		};
	}

	setTags(tags) {
		this.tagify.addTags(tags);
	}

	getTags() {
		return this.tagify.value.map(t => t.value);
	}
}

window.TagComponent = TagComponent;
