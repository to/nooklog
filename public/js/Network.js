class Network {
	constructor(baseUrl) {
		this.baseUrl = baseUrl;
	}

	async post(path, data, def) {
		return await this._fetchJSON(`${this.baseUrl}/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		}, 'POST failed', def);
	}

	async get(path, def) {
		return await this._fetchJSON(
			`${this.baseUrl}/${path}`, {},
			`GET failed: ${path}`, def,
		);
	}

	async delete(path) {
		return !!await this._fetch(
			`${this.baseUrl}/${path}`,
			{ method: 'DELETE' },
			'DELETE failed', false,
		);
	}

	async _fetchJSON(url, opts, error, def) {
		const res = await this._fetch(url, opts, error, def);
		return res ? await res.json() : def;
	}

	async _fetch(url, opts, error, def) {
		try {
			const res = await fetch(url, opts);
			if (!res.ok)
				await this._throwFetchError(res, error);
			return res;
		} catch (e) {
			app.error(e);
			return def;
		}
	}

	async _throwFetchError(res, fallback) {
		const text = await res.text().catch(() => '');
		let msg = text;
		try {
			const json = JSON.parse(text);
			if (json.error)
				msg = json.error;
		} catch (e) { }
		throw new Error(msg || fallback || `Error: ${res.status}`);
	}
}
