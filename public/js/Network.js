class Network {
	static baseUrl = window.location.origin;

	constructor(baseUrl = '') {
		this.baseUrl = Network.baseUrl + baseUrl;
	}

	async post(path, data, def) {
		const isRaw = data instanceof Blob || data instanceof FormData;
		return await this._fetch(`${this.baseUrl}${path}`, {
			method: 'POST',
			headers: isRaw ? {} : { 'Content-Type': 'application/json' },
			body: isRaw ? data : JSON.stringify(data),
		}, def);
	}

	async get(path, def) {
		return await this._fetch(`${this.baseUrl}${path}`, {}, def);
	}

	async _fetch(url, opts, def) {
		try {
			const res = await fetch(url, opts);
			const json = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(
					res.statusText + '\n' +
					json.json?.message || json.message);
			}

			return json;
		} catch (e) {
			app.error(e);
			return def;
		}
	}
}
