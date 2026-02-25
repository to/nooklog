class SettingPage {
	constructor() {
		this.els = {
			form: $('#form-config'),
			error: $('#error'),
		};

		this._bindEvents();
		this._init();
	}

	async _init() {
		this.config = (await chrome.storage.local.get('config')).config || {};

		const address = this.config['extension.serverAddress'];
		if (await this._alive(address))
			location.href = address + '/?setting=true';

		this.els.form['extension.serverAddress'].value = address || '';
	}

	_bindEvents() {
		this.els.form.addEventListener('submit', e => {
			e.preventDefault();
			this._save();
		});
	}

	async _save() {
		const address = this.els.form['extension.serverAddress'].value.trim();

		this.els.error.classList.add('none');

		if (await this._alive(address)) {
			// 設定値を保存する(初回特別動作)
			const values = { 'extension.serverAddress': address };
			Object.assign(this.config, values);
			await chrome.storage.local.set({ config: this.config });
			await fetch(`${address}/api/config`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			}).catch(() => { });

			location.href = address;
		} else {
			this.els.error.classList.remove('none');
		}
	}

	async _alive(address) {
		try {
			await fetch(`${address}/api/alive`, {
				signal: AbortSignal.timeout(1000),
			});
			return true;
		} catch { }
	}
}

new SettingPage();
