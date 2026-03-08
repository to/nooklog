class ConfigDialog extends Component {
	initialize() {
		this.els = {
			form: this.$('form'),
			dialog: this.$('dialog'),
			open: this.$('button.open'),
			close: this.$('button.close'),
		};
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

		if (getSearchParams().setting)
			this.els.dialog.showModal();
	}

	bindEvents() {
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

			const isDirty = this._getValue(e.target) != config[name];
			$.toggle(e.target.closest('.grid > div')?.querySelector('.error'), isDirty);
		});
		$.on(this.els.form, 'submit', e => {
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

		await Nooklog.saveConfig(config);

		this.els.dialog.close();
	}
}

customElements.define('nl-config-dialog', ConfigDialog);
