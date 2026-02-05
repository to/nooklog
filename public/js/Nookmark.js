class Nookmark {
	constructor(apiBase = '/api/bookmarks') {
		this.apiBase = apiBase;
	}

	async getTags() {
		const res = await fetch('json/tags.json');
		return (await res.json()).tags
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	}

	async getBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');

		return this._hydrate(await res.json());
	}

	async updateBookmark(bookmark) {
		const { tags, rating } = this._separateRating(bookmark.tags);
		const res = await fetch(`${this.apiBase}/${bookmark.id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: bookmark.title,
				memo: bookmark.memo,
				tags: tags,
				rating: rating,
			}),
		});

		if (!res.ok)
			throw new Error('Update failed');
	}

	async deleteBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`, { method: 'DELETE' });
		if (!res.ok)
			throw new Error('Delete failed');
	}

	async getBookmarks() {
		const res = await fetch(this.apiBase);
		return (await res.json()).map(this._hydrate);
	}

	async search({ tags, query, fields, sortBy }) {
		let minRating;
		({ tags, rating: minRating } = this._separateRating(tags));

		const res = await fetch(`/api/search?${new URLSearchParams({
			tags: tags.join(','),
			query,
			fields: fields.join(','),
			sortBy,
			...(minRating != null && { minRating }),
		})}`);
		return (await res.json()).map(this._hydrate);
	}

	_hydrate(r) {
		r.created_at = new Date(r.created_at);
		r.updated_at = new Date(r.updated_at);
		return r;
	}

	_separateRating(tags) {
		let rating = null;
		const filtered = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags: filtered, rating };
	}
}
