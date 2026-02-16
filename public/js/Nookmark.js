const SERVER_URL = 'http://localhost:3000';

const Nookmark = {
	apiBase: (window.location.protocol === 'chrome-extension:' ?
		SERVER_URL : '') + '/api',

	async getTags() {
		const res = await fetch(`${this.apiBase}/tags`);
		return ['5', '4', '3', '2', '1', '0'].concat(await res.json());
	},

	async getBookmark(id) {
		const res = await fetch(`${this.apiBase}/bookmarks/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');
		return this._populate(await res.json());
	},

	async findByUrl(url) {
		const res = await fetch(`${this.apiBase}/bookmarks?${new URLSearchParams({ url })}`);
		const json = await res.json();
		return json && this._populate(json);
	},

	async getBookmarks({ sortBy } = {}) {
		const res = await fetch(`${this.apiBase}/bookmarks?${new URLSearchParams({ sortBy })}`);
		return (await res.json()).map(this._populate);
	},

	async search({ tags, query, fields, sortBy }) {
		const res = await fetch(`${this.apiBase}/search?${new URLSearchParams({
			query, fields, sortBy,
			...this._separateRating(tags),
		})}`);
		return (await res.json()).map(this._populate);
	},

	async updateBookmark(bookmark) {
		const url = bookmark.id ?
			`${this.apiBase}/bookmarks/${bookmark.id}` :
			`${this.apiBase}/bookmarks`;

		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...bookmark,
				...this._separateRating(bookmark.tags),
			}),
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

	_separateRating(tags) {
		let rating = null;
		const filtered = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags: filtered, rating };
	},
};
