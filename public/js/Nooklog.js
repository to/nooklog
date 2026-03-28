const Nooklog = {
	net: new Network(window.location.origin + '/api'),

	async load() {
		const values = await this._post('config/get', {});
		this._saveConfig(values);
		hub.emit('Nooklog:load', values);
	},

	async saveConfig(values) {
		this._saveConfig(values);
		await this._post('config/save', values);
	},

	_saveConfig(values) {
		Object.assign(config, values);
		localStorage.config = JSON.stringify(config);
		bridge.emit('Nooklog:config', { config });
	},

	async find(ps) {
		return await this._post('find', ps);
	},

	async search(ps = {}) {
		const data = {
			limit: config['database.searchLimit'],
			...ps,
			...(ps.tags ? this.separateRating(ps.tags) : {}),
		};
		return await this._post('search', data, { count: 0, bookmarks: [] });
	},

	async save(bookmark) {
		const data = {
			...bookmark,
			...(bookmark.tags ? this.separateRating(bookmark.tags, bookmark.rating) : {}),
		};
		return await this._post('save', data, null);
	},

	async delete(id) {
		return await this.net.post('delete', { id });
	},

	async getTags() {
		const tags = await this._post('tags/get', []);
		return config['client.ratingInputMode'] !== 'stars'
			? tags.concat(['5', '4', '3', '2', '1', '0'])
			: tags;
	},

	async getMarkdown({ url, title, html }) {
		return await this.net.post('markdown/get', { url, title, html }, {});
	},

	async import(file, options = {}) {
		return await this.net.post(`import?${qs(options)}`, file);
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
