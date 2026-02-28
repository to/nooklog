window.Nooklog = {
	apiBase: window.location.origin + '/api',

	async getConfig() {
		const values = await this._getJSON(`${this.apiBase}/config`);
		this._saveConfig(values);
		return config;
	},

	async saveConfig(values) {
		this._saveConfig(values);
		await this._postJSON(`${this.apiBase}/config`, values);
	},

	_saveConfig(values) {
		Object.assign(config, values);
		localStorage.config = JSON.stringify(config);
		this._dispatch('command', { event: 'config', config });
	},

	async getTags() {
		const tags = await this._getJSON(`${this.apiBase}/tags`);
		return config['client.ratingInputMode'] !== 'stars'
			? ['5', '4', '3', '2', '1', '0'].concat(tags)
			: tags;
	},

	async getBookmark(id) {
		return this._populate(await this._getJSON(`${this.apiBase}/bookmarks/${id}`));
	},

	async findByUrl(url) {
		const bookmark = await this._getJSON(`${this.apiBase}/bookmarks?${new URLSearchParams({ url })}`);
		return bookmark && this._populate(bookmark);
	},

	async getBookmarks({ sortBy } = {}) {
		const bookmarks = await this._getJSON(`${this.apiBase}/bookmarks?${new URLSearchParams({ sortBy })}`);
		return bookmarks.map(this._populate);
	},

	async search({ tags, query, fields, sortBy }) {
		const bookmarks = await this._getJSON(`${this.apiBase}/search?${new URLSearchParams({
			query, fields, sortBy,
			...this._separateRating(tags),
		})}`);
		return bookmarks.map(this._populate);
	},

	async updateBookmark(bookmark) {
		const url = bookmark.id ?
			`${this.apiBase}/bookmarks/${bookmark.id}` :
			`${this.apiBase}/bookmarks`;

		const res = await this._postJSON(url, {
			...bookmark,
			...(bookmark.tags ? this._separateRating(bookmark.tags, bookmark.rating) : {}),
		});

		if (!res.ok)
			throw new Error('Update failed');
	},

	async deleteBookmark(id) {
		const res = await fetch(`${this.apiBase}/bookmarks/${id}`, { method: 'DELETE' });
		if (!res.ok)
			throw new Error('Delete failed');
	},

	_populate(r) {
		r.created_at = new Date(r.created_at);
		r.updated_at = new Date(r.updated_at);
		return r;
	},

	_separateRating(tags, rating = 0) {
		tags = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags, rating };
	},

	async _postJSON(url, data) {
		return await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});
	},

	async _getJSON(url) {
		const res = await fetch(url);
		if (!res.ok)
			throw new Error(`GET failed: ${res.status} ${url}`);
		return await res.json();
	},

	_dispatch(type, msg = {}) {
		window.dispatchEvent(new CustomEvent(`nooklog:${type}`, { detail: msg }));
	},
};

await Nooklog.getConfig();
