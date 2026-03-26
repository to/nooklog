const Nooklog = {
	net: new Network(window.location.origin + '/api'),

	async load() {
		const values = await this._get('config', {});
		this._saveConfig(values);
		hub.emit('Nooklog:load', values);
	},

	async saveConfig(values) {
		this._saveConfig(values);
		await this._post('config', values);
	},

	_saveConfig(values) {
		Object.assign(config, values);
		localStorage.config = JSON.stringify(config);
		bridge.emit('Nooklog:config', { config });
	},

	async getBookmark(id) {
		return await this._get(`bookmarks/${id}`, null);
	},

	async findByUrl(url) {
		return await this._get(`bookmarks?${qs({ url })}`, null);
	},

	async resolve({ id, url } = {}) {
		return id ? await this.getBookmark(id) :
			url ? await this.findByUrl(url) : null;
	},

	async getBookmarks({ sortBy } = {}) {
		return await this._get(`bookmarks?${qs({
			sortBy,
			limit: 100, // トップページとして暫定的に表示する件数(最近のもの)
		})}`, { count: 0, bookmarks: [] });
	},

	async search({ mode, tags, query, fields, sortBy }) {
		return await this._get(`search?${qs({
			mode, query, fields, sortBy,
			limit: config['database.searchLimit'],
			...this.separateRating(tags),
		})}`, { count: 0, bookmarks: [] });
	},

	async updateBookmark(bookmark) {
		const path = bookmark.id ? `bookmarks/${bookmark.id}` : 'bookmarks';
		const data = {
			...bookmark,
			...(bookmark.tags ? this.separateRating(bookmark.tags, bookmark.rating) : {}),
		};
		return await this._post(path, data, null);
	},

	async deleteBookmark(id) {
		return await this.net.delete(`bookmarks/${id}`);
	},

	async getTags() {
		const tags = await this._get('tags', []);
		return config['client.ratingInputMode'] !== 'stars'
			? tags.concat(['5', '4', '3', '2', '1', '0'])
			: tags;
	},

	async generateMarkdown({ url, title, html }) {
		return await this.net.post('markdown', { url, title, html }, {});
	},

	async importBookmarks(file, options = {}) {
		return await this.net.post(`import/bookmarks?${qs(options)}`, file);
	},

	async exportBookmarks(options = {}) {
		return await this.net.get(`export/bookmarks?${qs(options)}`);
	},

	async _get(path, def) {
		return this._populate(await this.net.get(path, def));
	},

	async _post(path, data, def) {
		return this._populate(await this.net.post(path, data, def));
	},

	_populate(r) {
		if (!r)
			return r;

		if (Array.isArray(r))
			return r.map(i => this._populate(i));

		if (r.bookmarks) {
			r.bookmarks = this._populate(r.bookmarks);
			return r;
		}

		r.created_at = new Date(r.created_at);
		r.updated_at = new Date(r.updated_at);
		return r;
	},

	separateRating(tags, rating = 0) {
		// タグとレートで最も高いものをレートとする
		tags = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags, rating };
	},
};

Nooklog.load();
