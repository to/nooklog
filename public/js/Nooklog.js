const Nooklog = {
	net: new Network(),
	currentSearch: null,

	async load() {
		const values = await this.rpc('config/get');
		this.clearConfig();
		this._updateConfig(values);
		hub.emit('Nooklog:load', values);
	},

	async clearConfig() {
		for (const k in config)
			delete config[k];
	},

	async saveConfig(input) {
		Object.assign(config, input);
		const values = await this.rpc('config/save', config);
		this._updateConfig(values);
	},

	_updateConfig(values) {
		Object.assign(config, values);
		localStorage.config = JSON.stringify(config);
		bridge.emit('Nooklog:updateConfig', config);
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

		const task = this.rpc('search', data,
			{ bookmarks: [], count: 0, totalCount: 0 });
		this.currentSearch = task;

		// Only return result for the last search
		const res = await task;
		return this.currentSearch === task
			? this._populate(res)
			: null;
	},

	async save(bookmark) {
		const data = {
			...bookmark,
			...(bookmark.tags ? this.separateRating(bookmark.tags, bookmark.rating) : {}),
		};
		return this._populate(await this.rpc('save', data, null));
	},

	async delete(id, confirm = true) {
		if (confirm && !window.confirm('Are you sure you want to delete this bookmark?'))
			return;

		return this._populate(await this.rpc('delete', { id }));
	},

	async getTags() {
		const tags = await this.rpc('getTags');
		return (config['client.ratingInputMode'] === 'tags' || config['client.ratingInputMode'] === 'both')
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

	_populate(b) {
		if (b == null)
			return b;

		if (Array.isArray(b))
			return b.map(i => this._populate(i));

		if (b.bookmarks) {
			b.bookmarks = this._populate(b.bookmarks);
			return b;
		}

		b.created_at = new Date(b.created_at);
		b.updated_at = new Date(b.updated_at);
		return b;
	},

	separateRating(tags, rating = 0) {
		// Take highest rate from tags and rate
		tags = tags.filter(t => {
			if (!/^\d$/.test(t))
				return true;
			rating = (t > rating) ? +t : rating;
		});
		return { tags, rating };
	},
};

Nooklog.load();
