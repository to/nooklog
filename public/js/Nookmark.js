class Nookmark {
	static apiBase = '/api/bookmarks';

	static async getTags() {
		const res = await fetch('json/tags.json');
		return (await res.json()).tags
			.sort((a, b) => a.length - b.length || a.localeCompare(b));
	}

	static async getBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`);
		if (!res.ok)
			throw new Error('Failed to load bookmark');

		return this._populate(await res.json());
	}

	static async findByUrl(url) {
		const res = await fetch(`${this.apiBase}?${new URLSearchParams({ url })}`);
		const json = await res.json();
		return json && this._populate(json);
	}

	static async updateBookmark(bookmark) {
		const { tags, rating } = this._separateRating(bookmark.tags);
		const url = bookmark.id ? `${this.apiBase}/${bookmark.id}` : this.apiBase;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: bookmark.url,
				title: bookmark.title,
				memo: bookmark.memo,
				tags: tags,
				rating: rating,
				html: bookmark.html,
			}),
		});

		if (!res.ok)
			throw new Error('Update failed');
	}

	static async deleteBookmark(id) {
		const res = await fetch(`${this.apiBase}/${id}`, { method: 'DELETE' });
		if (!res.ok)
			throw new Error('Delete failed');
	}

	static async getBookmarks() {
		const res = await fetch(this.apiBase);
		return (await res.json()).map(this._populate);
	}

	static async search({ tags, query, fields, sortBy }) {
		let minRating;
		({ tags, rating: minRating } = this._separateRating(tags));

		const res = await fetch(`/api/search?${new URLSearchParams({
			tags: tags.join(','),
			query,
			fields: fields.join(','),
			sortBy,
			...(minRating != null && { minRating }),
		})}`);
		return (await res.json()).map(this._populate);
	}

	static _populate(r) {
		r.created_at = new Date(r.created_at);
		r.updated_at = new Date(r.updated_at);
		return r;
	}

	static _separateRating(tags) {
		let rating = null;
		const filtered = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags: filtered, rating };
	}
}
