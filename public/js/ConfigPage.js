class ConfigPage {
	constructor() {
		this.els = {
			form: $('#form-config'),
			dialog: $('#dialog-config'),
			open: $('#btn-config'),
			close: $('#btn-config-close'),
		};

		this._bindEvents();
		this._init();
	}

	async _init() {
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

		if (getSearchParams().setting)
			this.els.dialog.showModal();
	}

	_bindEvents() {
		this.els.open.addEventListener('click', () => this.els.dialog.showModal());
		this.els.close.addEventListener('click', () => this.els.dialog.close());
		this.els.form.addEventListener('input', e => {
			const name = e.target.name;
			if (!name)
				return;

			if (name === 'client.theme') {
				const value = e.target.value;
				const theme = value === 'system'
					? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
					: value;
				document.documentElement.classList.remove('dark');
				document.documentElement.classList.add(theme);
				Nookmark.saveConfig({ 'client.theme': value });
			}

			// 値の変更による副作用を警告する
			const isDirty = this._getValue(e.target) != config[name];
			e.target
				.closest('#form-config > .grid > div')
				?.querySelector('.error')
				?.classList.toggle('none', !isDirty);
		});
		this.els.form.addEventListener('submit', e => {
			e.preventDefault();
			this._save();
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
		await Nookmark.saveConfig(config);

		this.els.dialog.close();
	}
}

new ConfigPage();
