class Network {
	constructor(baseUrl) {
		this.baseUrl = baseUrl;
	}

	async post(path, data, def) {
		const isRaw = data instanceof Blob || data instanceof FormData;
		try {
			const res = await fetch(`${this.baseUrl}/${path}`, {
				method: 'POST',
				headers: isRaw ? {} : { 'Content-Type': 'application/json' },
				body: isRaw ? data : JSON.stringify(data),
			});

			if (res.ok)
				return await res.json();

			const text = await res.text().catch(() => '');
			let msg = text;
			try {
				const json = JSON.parse(text);
				if (json.error)
					msg = json.error;
			} catch (e) { }
			throw new Error(msg || `POST failed: ${res.status}`);
		} catch (e) {
			app.error(e);
			return def;
		}
	}
}
