const Nookmark = {
	apiBase: '/api/bookmarks',

	async getTags() {
		const res = await fetch('json/tags.json');
		return (await res.json()).tags
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	},

	async getBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');
		return this._populate(await res.json());
	},

	async findByUrl(url) {
		const res = await fetch(`${this.apiBase}?${new URLSearchParams({ url })}`);
		const json = await res.json();
		return json && this._populate(json);
	},

	async updateBookmark(bookmark) {
		const url = bookmark.id ?
			`${this.apiBase}/${bookmark.id}` :
			this.apiBase;

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
		const res = await fetch(`${this.apiBase}/${id}`, { method: 'DELETE' });
		if (!res.ok)
			throw new Error('Delete failed');
	},

	async getBookmarks() {
		const res = await fetch(this.apiBase);
		return (await res.json()).map(this._populate);
	},

	async search({ tags, query, fields, sortBy }) {
		const res = await fetch(`/api/search?${new URLSearchParams({
			query, fields, sortBy,
			...this._separateRating(tags),
		})}`);
		return (await res.json()).map(this._populate);
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
