export default class Pinboard {
	constructor(token) {
		this.token = token || process.env.PINBOARD_TOKEN;
		if (!this.token)
			throw new Error('PINBOARD_TOKEN is not defined in environment variables or constructor arguments');

	}

	async call(endpoint, options = {}) {
		const params = new URLSearchParams({
			...options,
			auth_token: this.token,
			format: 'json',
		});

		try {
			const res = await fetch(`https://api.pinboard.in/v1/${endpoint}?${params}`);
			if (!res.ok) {
				const error = new Error(`Pinboard API error (${res.status}): ${res.statusText}`);
				error.cause = res;
				throw error;
			}
			return await res.json();
		} catch (error) {
			console.error(`Pinboard Error [${endpoint}]: ${error.message}\n${options.description}\n${options.url}`);
			throw error;
		}
	}

	add(options) {
		return this.call('posts/add', options);
	}

	get(options) {
		return this.call('posts/get', options);
	}

	delete(url) {
		return this.call('posts/delete', { url });
	}
}
