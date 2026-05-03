class TagInput extends Component {
	static INPUT_LOCK_MS = 180;

	initialize() {
		this.innerHTML = `<input name="${this.getAttribute('name')}"
			placeholder="${this.getAttribute('placeholder') || ''}" class="flex-1">`;
		this.input = this.$('input');
		this.style.display = 'contents';

		this.maxWhitelist = 10;

		const tagify = new Tagify(this.input, {
			maxTags: 20,
			delimiters: ',| ',
			dropdown: {
				enabled: 1, // Do not show right after focus (ignore focus movement)
				placeAbove: false,
				closeOnSelect: true,
				searchKeys: ['value'],
				fuzzySearch: config['client.tagMatchMode'] === 'contains',
				highlightFirst: true,
				maxItems: this.maxWhitelist,
			},
		});
		this.tagify = tagify;
		this.lockInput = false;
		this.refresh();

		// Turn off IME
		tagify.DOM.input.setAttribute('inputmode', 'url');

		// Monitor key input
		tagify.DOM.input.addEventListener('keydown', e => {
			// Block natural events only
			if (this.lockInput && e.isTrusted) {
				e.preventDefault();
				return false;
			}
			if (e.key === 'Tab')
				this.enter();
		});

		// Dropdown should ignore mouse while typing
		const resetInputtingState = debounce(() => {
			tagify.DOM.dropdown.classList.remove('is-inputting');
		}, 500);

		tagify.on('input', () => {
			tagify.DOM.dropdown.classList.add('is-inputting');
			resetInputtingState();
		});

		// Click tag to remove
		tagify.on('click', e => {
			tagify.removeTags(e.detail.tag);
		});
	}

	ready() {
		this.tagify.settings.dropdown.fuzzySearch = config['client.tagMatchMode'] === 'contains';

		if (config['client.tagMatchMode'] === 'smart') {
			this.tagify.dropdown.filterListItems = value => {
				const selected = new Set(this.tagify.value.map(v => v.value));
				let whitelist = this.tagify.whitelist.filter(t => !selected.has(t));

				if (!value)
					return whitelist.slice(0, this.maxWhitelist);

				const regex = new RegExp(
					`^${[...value].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}`, 'i');

				whitelist = whitelist
					.filter(t => regex.test(t))
					.sort((a, b) => (b.startsWith(value) - a.startsWith(value)) || (a.length - b.length))
					.slice(0, this.maxWhitelist);

				// Emphasize and auto-close when items are sufficiently narrowed
				if (config['client.autoCompleteTags'] && !this.lockInput &&
					(whitelist.length == 1 || whitelist.filter(t => t.startsWith(value)).length == 1)) {
					this.lockInput = true;
					setTimeout(() => this.lockInput = false, TagInput.INPUT_LOCK_MS);
					setTimeout(() => {
						this.enter();
					}, 16);
				}

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
		this.removeAllTags();

		// Remove duplicate tags and determine appropriate string
		// (Fix data mix-up when detaching window)
		const { tags, rating } = Nooklog.separateRating(
			[].concat(...args.filter(v => v)));
		this.tagify.addTags([...new Set([].concat(rating || [], tags))]);
	}

	getTags() {
		return this.tagify.value.map(t => t.value);
	}

	removeAllTags() {
		this.tagify.loadOriginalValues([]);
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
