const Nooklog = {
	net: new Network(),

	async load() {
		const values = await this.rpc('config/get');
		this._saveConfig(values);
		hub.emit('Nooklog:load', values);
	},

	async saveConfig(input) {
		this._saveConfig(input);
		await this.rpc('config/save', input);
	},

	_saveConfig(input) {
		Object.assign(config, input);
		localStorage.config = JSON.stringify(config);
		bridge.emit('Nooklog:config', { config });
	},

	async find(ps) {
		return await this.rpc('find', ps);
	},

	async search(ps = {}) {
		const data = {
			limit: config['database.searchLimit'],
			...ps,
			...(ps.tags ? this.separateRating(ps.tags) : {}),
		};
		return await this.rpc('search', data);
	},

	async save(bookmark) {
		const data = {
			...bookmark,
			...(bookmark.tags ? this.separateRating(bookmark.tags, bookmark.rating) : {}),
		};
		return await this.rpc('save', data, null);
	},

	async delete(id) {
		return await this.rpc('delete', { id });
	},

	async getTags() {
		const tags = await this.rpc('getTags');
		return config['client.ratingInputMode'] !== 'stars'
			? tags.concat(['5', '4', '3', '2', '1', '0'])
			: tags;
	},

	async convertMarkdown({ url, title, html }) {
		return await this.rpc('convertMarkdown', { url, title, html });
	},

	async import(file, options = {}) {
		return await this.net.post(`/api/import?${qs(options)}`, file);
	},

	async rpc(path, data = {}, def = undefined) {
		const res = await this.net.post('/rpc/' + path, { json: data }, def);
		return this._populate(res?.json ?? res);
	},

	_populate(r) {
		if (r == null)
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
