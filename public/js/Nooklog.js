const Nooklog = {
	net: new Network(),

	async load() {
		const values = await this.rpc('config/get');
		this._updateConfig(values);
		hub.emit('Nooklog:load', values);
	},

	async saveConfig(input) {
		Object.assign(config, input);

		const values = await this.rpc('config/save', config);
		this._updateConfig(values);
	},

	_updateConfig(values) {
		Object.assign(config, values);
		localStorage.config = JSON.stringify(config);
		bridge.emit('Nooklog:updateConfig', { config });
		hub.emit('Nooklog:updateConfig', config);
	},

	async find(ps) {
		return this._populate(await this.rpc('find', ps));
	},

	async pop(ps) {
		return this._populate(await this.rpc('pop', ps));
	},

	async stash(ps) {
		await this.rpc('stash', ps);
	},

	async search(ps = {}) {
		const data = {
			limit: config['database.searchLimit'],
			...ps,
			...(ps.tags ? this.separateRating(ps.tags) : {}),
		};
		return this._populate(await this.rpc('search', data,
			{ bookmarks: [], count: 0, totalCount: 0 }));
	},

	async save(bookmark) {
		const data = {
			...bookmark,
			...(bookmark.tags ? this.separateRating(bookmark.tags, bookmark.rating) : {}),
		};
		return this._populate(await this.rpc('save', data, null));
	},

	async delete(id) {
		return this._populate(await this.rpc('delete', { id }));
	},

	async getTags() {
		const tags = await this.rpc('getTags');
		return config['client.ratingInputMode'] !== 'stars'
			? tags.concat(['5', '4', '3', '2', '1', '0'])
			: tags;
	},

	async getVectorModels(url) {
		return await this.rpc('getVectorModels', url, []);
	},

	async import(file, options = {}) {
		return await this.net.post(`/api/import?${qs(options)}`, file, {});
	},

	async rpc(path, data = {}, def = undefined) {
		const res = await this.net.post('/rpc/' + path, { json: data }, def);
		return res?.json ?? res;
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
