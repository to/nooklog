import ky from 'ky';
import config from '../config.js';
import baseLog from '../log.js';
import hub from '../hub.js';
import { Warning } from '../util.js';

const log = baseLog.child({ module: 'vector' });

const PRESET_MAP = {
	'gemma': {
		queryPrefix: 'task: search result | query: ',
		documentTitlePrefix: 'title: ',
		documentTextPrefix: 'text: ',
	},
	'arctic': {
		queryPrefix: 'Represent this sentence for searching relevant passages: ',
	},
	'qwen3': {
		queryPrefix: 'Instruct: Retrieve relevant documents for the given query\nQuery: ',
	},
	'multilingual-e5': {
		queryPrefix: 'query: ',
		documentTitlePrefix: 'passage: ',
	},
	'ruri-v': {
		queryPrefix: '検索クエリ: ',
		documentTitlePrefix: '検索文書: ',
	},
};

const getPresets = () => PRESET_MAP[
	Object.keys(PRESET_MAP).find(k => new RegExp(k, 'i').test(config['sentence.vector.model']))];

const vector = {
	_dimension: 0,
	_calibration: null,
	_lastModel: '',
	hasError: false,

	async getModels(url) {
		const configUrl = url || config['sentence.vector.url'];
		try {
			const data = await this._fetch(configUrl.replace(/\/embeddings\/?$/, '/models'));
			return data.map(m => m.id);
		} catch (e) {
			log.warn({ url: configUrl, cause: e.message }, 'failed to fetch vector models');
			return [];
		}
	},

	async embedQuery(query) {
		const ps = getPresets();
		const prefix = config['sentence.vector.queryPrefix'] || ps?.queryPrefix || '';

		return this._embed(prefix + query);
	},

	async embedDocument(docs) {
		const ps = getPresets();
		const titlePrefix = config['sentence.vector.documentTitlePrefix'] || ps?.documentTitlePrefix || '';
		const textPrefix = config['sentence.vector.documentTextPrefix'] || ps?.documentTextPrefix || '';

		const inputs = [].concat(docs).map(d => {
			const title = typeof d === 'object' ? d.title : '';
			const text = typeof d === 'object' ? d.text : d;
			return [
				title && (titlePrefix + title),
				text && (textPrefix + text),
			].filter(Boolean).join('\n');
		});

		return this._embed(inputs);
	},

	async _embed(inputs) {
		const isArray = Array.isArray(inputs);
		const items = [].concat(inputs).map(s => (s || '').trim());
		const results = [];
		const batchSize = 32;
		for (let i = 0; i < items.length; i += batchSize)
			results.push(...await this._request(items.slice(i, i + batchSize)));

		return isArray ? results : results[0];
	},

	async _request(inputs) {
		if (!config['sentence.vector.enabled'])
			return [];

		const model = config['sentence.vector.model'];
		const url = config['sentence.vector.url'];

		try {
			const data = await this._fetch(url, {
				method: 'POST',
				json: { model, input: inputs },
			});
			const results = data.map(d => d.embedding);

			if (this.hasError) {
				this.hasError = false;
				log.info('embedding service recovered');
				hub.emit('vector.ready');
			}

			return results;
		} catch (e) {
			this.hasError = true;
			const code = e.cause?.code || e.cause?.cause?.code || e.data?.error?.code || e.data?.error?.type;
			const detail = `${e.message}${code ? ` > ${code}` : ''}`;
			throw new Warning(`Embedding service failed [${detail}]`, e);
		}
	},

	async _fetch(url, options = {}) {
		const apiKey = config['sentence.vector.apiKey'];
		if (apiKey)
			options.headers = { ...options.headers, Authorization: `Bearer ${apiKey}` };

		const res = await ky(url, options).json();
		return res.data;
	},

	async getDimension() {
		this._checkModel();

		if (this._dimension)
			return this._dimension;

		const [sample] = await this.embedDocument([{ title: '', text: ' ' }]);
		return this._dimension = sample.length;
	},

	async getCalibration() {
		this._checkModel();

		if (this._calibration)
			return this._calibration;

		const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
		const vecs = [await this.embedQuery('cat')];
		vecs.push(...await Promise.all([
			this.embedDocument({ title: 'Animal', text: 'kitten' }),
			this.embedQuery('A round fruit with red, yellow, or green skin and a whitish inside.'),
			this.embedDocument({
				title: 'Space exploration',
				text: 'The exploration of outer space using spacecraft, with or without a human crew.',
			}),
		]));

		const near = 1 - dot(vecs[0], vecs[1][0]);
		const far = 1 - dot(vecs[2], vecs[3][0]);
		const threshold = (near + far) / 2;
		log.info({ near: near.toFixed(4), far: far.toFixed(4), threshold: threshold.toFixed(4) }, 'threshold calibrated');

		return this._calibration = { near, far, threshold };
	},

	_checkModel() {
		const model = config['sentence.vector.model'];
		if (this._lastModel !== model) {
			this._dimension = 0;
			this._calibration = null;
			this._lastModel = model;
		}
	},
};

export default vector;
