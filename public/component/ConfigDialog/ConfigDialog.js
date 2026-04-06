class ConfigDialog extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			dialog: this.$('dialog'),
			open: this.$('button.open'),
			close: this.$('button.close'),
			import: this.$('button.import'),
		};
		this.results = null;

		// SearchFormで変更される前の値を保存する
		this.autoOpen = getSearchParams().setting;
	}

	async ready() {
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
			this.els.dialog.showModal();

		bridge.emit('ConfigDialog:shortcuts', {}, true);
		this._updateBookmarklet();
		this._updateSentenceProviderVisibility();
	}

	bindEvents() {
		hub.on('SearchForm:search', results => {
			this.results = results;
			this.$$('.export-range option[value="all"]').forEach(el => el.textContent =
				`All (${results.totalCount})`);
			this.$$('.export-range option[value="search"]').forEach(el => el.textContent =
				`Search (${results.count}${results.bookmarks.length === results.count ? '+' : ''})`);
		});
		$.on(this.els.open, 'click', () => this.els.dialog.showModal());
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

			if (name === 'sentence.provider')
				this._updateSentenceProviderVisibility();

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
			input.accept = '.html,.json';
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

					const message = count > 0 ?
						`Successfully imported ${count} bookmarks! ✨` :
						'All bookmarks are already up to date.';
					app.notify(message, 'info', 5000);
					hub.emit('ConfigDialog:import');
				} catch (err) {
					app.error(err);
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

			// OpenAPI経由でダイレクトにダウンロードを行う
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
			bridge.emit('ConfigDialog:openShortcuts', {}, true);
		});

		bridge.on('Background:shortcuts', msg => {
			const command = msg.shortcuts.find(c => c.name === 'open-update-page');
			this.$('.shortcut-key').textContent = command?.shortcut || 'Not set';
		});
	}

	_getValue(el) {
		const { type, checked, value } = el;
		return type === 'checkbox' ? checked : type === 'number' ? +value : value;
	}

	async _save() {
		const config = {};
		for (const el of this.els.form.elements) {
			if (!el.name || (el.type === 'radio' && !el.checked))
				continue;

			config[el.name] = this._getValue(el);
		}

		await Nooklog.saveConfig(config);
		this.$$('.error').forEach($.hide);

		this.els.dialog.close();
	}

	_updateSentenceProviderVisibility() {
		const provider = this.$('input[name="sentence.provider"]:checked')?.value;
		this.$$('[data-provider]').forEach(el => $.toggle(el, el.dataset.provider.split(',').includes(provider)));
	}

	_updateBookmarklet() {
		const server = this.els.form['extension.serverAddress'].value.replace(/\/$/, '');
		const isTopRight = this.$('input[name="client.windowPosition"]:checked')?.value === 'top-right';

		const code = `javascript:(function(server='${server.replace(/\/$/, '')}',isTopRight=${isTopRight}){const width=500,height=480,left=screen.availLeft+screen.availWidth-width-30,top=isTopRight?screen.availTop+8:screen.availTop+screen.availHeight-height-2,query=\`url=\${encodeURIComponent(location.href)}&title=\${encodeURIComponent(document.title)}\`,features=\`width=\${width},height=\${height},left=\${left},top=\${top},toolbar=0,menubar=0,location=0,status=0,scrollbars=1,resizable=1\`;window.open(\`\${server}/update.html?\${query}\`,'nooklog',features);})();`;

		const link = this.$('.bookmarklet a');
		if (link)
			link.href = code;
	}
}

customElements.define('nl-config-dialog', ConfigDialog);
