class ConfigDialog extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			dialog: this.$('dialog'),
			open: this.$('button.open'),
			close: this.$('button.close'),
			import: this.$('button.import'),
			submit: this.$('button[type="submit"]'),
		};
		this.results = null;

		this._setSubmitting(false);

		debounce(this, '_fetchVectorModels', 800);

		// Save the value before changed by SearchForm
		this.autoOpen = getSearchParams().setting;
	}

	async ready() {
		if (config['server.mode'] === 'readonly')
			return;

		$.show(this.els.open);

		for (const el of this.els.form.elements) {
			if (!el.name)
				continue;

			const val = config[el.name];
			if (el.type === 'radio')
				el.checked = (el.value === String(val));
			else if (el.type === 'checkbox')
				el.checked = val;
			else
				el.value = val;
		}

		if (this.autoOpen)
			this.showModal();

		bridge.emit('ConfigDialog:shortcuts');

		this._updateBookmarklet();
		this._updateEmbeddingVisibility();
	}

	bindEvents() {
		hub.on('SearchForm:search', results => {
			this.results = results;
			this.$$('.export-range option[value="all"]').forEach(el => el.textContent =
				`All (${results.totalCount})`);
			this.$$('.export-range option[value="search"]').forEach(el => el.textContent =
				`Search (${results.count}${results.bookmarks.length === results.count ? '+' : ''})`);
		});

		$.on(this.els.open, 'click', () => this.showModal());

		$.on(this.els.close, 'click', () => this.els.dialog.close());

		$.on(this.els.form, 'input', e => {
			const name = e.target.name;
			if (!name)
				return;

			if (name === 'client.theme') {
				Nooklog.saveConfig({ 'client.theme': e.target.value });
				updateTheme();
				updateTint();
			}

			if (name === 'client.tint') {
				Nooklog.saveConfig({ 'client.tint': e.target.value });
				updateTint();
			}

			if (name === 'sentence.vector.enabled')
				this._updateEmbeddingVisibility();

			if (name === 'sentence.vector.baseUrl')
				this._fetchVectorModels();

			if (name === 'client.windowPosition' || name === 'extension.serverAddress')
				this._updateBookmarklet();

			const isDirty = this._getValue(e.target) != config[name];
			$.toggle(e.target.closest('.grid > div')?.querySelector('.error'), isDirty);
		});

		$.on(this.els.form, 'submit', e => {
			e.preventDefault();
			this._save();
		});

		$.on(this.els.import, 'click', () => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.html,.json,.txt';
			input.onchange = async e => {
				const file = e.target.files[0];

				if (!file)
					return;

				const buttonText = this.els.import.textContent;
				try {
					this.els.import.disabled = true;
					this.els.import.textContent = 'Importing...';

					const folderTag = this.$('.folder-tag').value === 'true';
					const { count } = await Nooklog.import(file, { folderTag });
					if (count == null)
						return;

					const message = count > 0 ?
						`Successfully imported ${count} bookmarks! ✨` :
						'All bookmarks are already up to date.';
					app.notify(message, 'info', 5000);
					hub.emit('ConfigDialog:import');
				} finally {
					this.els.import.disabled = false;
					this.els.import.textContent = buttonText;
				}
			};
			input.click();
		});

		const download = (e, options) => {
			const range = e.target.closest('.container').querySelector('.export-range').value;
			const query = range === 'search' ? this.results?.query : {};

			// Download directly via OpenAPI
			window.location.href = `${Network.baseUrl}/api/export?${qs({ ...options, ...query })}`;
			app.notify('Export started.\nPlease check your download folder.', 'info', 5000);
		};

		$.on(this.$('button.export-bookmarks'), 'click', e => download(e, {
			exportFormat: this.$('.export-format').value,
		}));

		$.on(this.$('button.export-documents'), 'click', e => download(e, {
			exportFormat: 'markdown',
			exportMeta: this.$('.export-meta').value,
			exportStructure: this.$('.export-structure').value,
		}));

		$.on(this.$('.shortcut-key'), 'click', e => {
			e.preventDefault();
			bridge.emit('ConfigDialog:openShortcuts');
		});

		bridge.on('Background:shortcuts', msg => {
			const command = msg.shortcuts.find(c => c.name === 'open-update-page');
			this.$('.shortcut-key').textContent = command?.shortcut || 'Not set';
		});

		$.on(this.$('button.copy-api-key'), 'click', () => {
			const input = this.$('input[name="server.apiKey"]');
			if (!input.value)
				return;

			navigator.clipboard.writeText(input.value);
			app.notify('API Key copied to clipboard.', 'info');
		});

		$.on(this.$('button.generate-api-key'), 'click', async () => {
			if (config['server.apiKey'] &&
				!confirm('Generating a new API Key will invalidate the current one. Continue?'))
				return;

			await Nooklog.generateApiKey();

			this.$('input[name="server.apiKey"]').value = config['server.apiKey'];
			app.notify('New API Key generated.', 'info');
		});

		$.on(this.$('button.backfill-content'), 'click', async e => {
			const limit = +this.$('.backfill-limit').value || 100;
			const { count } = await Nooklog.backfillContent({ limit });
			if (count > 0)
				app.notify(`Backfill started for ${count} bookmarks.`, 'info');
			else
				app.notify('All bookmarks are already up to date.', 'info');
		});
	}

	showModal() {
		this.els.dialog.showModal();
		this._fetchVectorModels();
	}

	_getValue(el) {
		const { type, checked, value } = el;
		return type === 'checkbox' ? checked : type === 'number' ? +value : value;
	}

	async _save() {
		if (this.isSubmitting)
			return;

		this._setSubmitting(true);
		const values = {};
		for (const el of this.els.form.elements) {
			if (!el.name || (el.type === 'radio' && !el.checked))
				continue;

			values[el.name] = this._getValue(el);
		}

		try {
			await Nooklog.saveConfig(values);
			this.$$('.error').forEach($.hide);
			this.els.dialog.close();
		} finally {
			this._setSubmitting(false);
		}
	}

	_setSubmitting(active) {
		this.isSubmitting = active;
		this.els.submit.disabled = active;
	}

	_updateEmbeddingVisibility() {
		const enabled = this.$('input[name="sentence.vector.enabled"]')?.checked;
		this.$$('[data-vector-enabled]').forEach(el => $.toggle(el, el.dataset.vectorEnabled === String(enabled)));
	}

	async _fetchVectorModels() {
		const elUrl = this.$('input[name="sentence.vector.baseUrl"]');
		if (!elUrl)
			return;

		let url = elUrl.value.trim();
		if (/\/v\d+(\/|$)/.test(url)) {
			// Truncate path after v1 to normalize
			url = url.split(/\/v\d+(\/|$)/)[0];
			if (!url.endsWith('/'))
				url += '/';
			elUrl.value = url;
		}

		const models = await Nooklog.getVectorModels(url);
		const elSelect = this.$('select[name="sentence.vector.model"]');
		const current = config['sentence.vector.model'];
		const options = Array.from(new Set([current, ...models].filter(Boolean)))
			.sort((a, b) => {
				const aE = /embed/i.test(a);
				const bE = /embed/i.test(b);
				if (aE !== bE)
					return bE - aE;
				return a.localeCompare(b);
			});

		elSelect.innerHTML = options.map(m => `<option value="${m}">${m}</option>`).join('');
		elSelect.value = current;
	}

	_updateBookmarklet() {
		const isTopRight = this.$('input[name="client.windowPosition"]:checked')?.value === 'top-right';
		const code = `javascript:(function(server='${location.origin}',isTopRight=${isTopRight}){const width=500,height=480,left=screen.availLeft+screen.availWidth-width-30,top=isTopRight?screen.availTop+8:screen.availTop+screen.availHeight-height-2,query=\`url=\${encodeURIComponent(location.href)}&title=\${encodeURIComponent(document.title)}\`,features=\`width=\${width},height=\${height},left=\${left},top=\${top},toolbar=0,menubar=0,location=0,status=0,scrollbars=1,resizable=1\`;window.open(\`\${server}/update.html?\${query}\`,'nooklog',features);})();`;

		const link = this.$('.bookmarklet a');
		if (link)
			link.href = code;
	}
}

customElements.define('nl-config-dialog', ConfigDialog);
