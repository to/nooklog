import config from '../config.js';
import baseLog from '../log.js';
import { retry } from '../util.js';

const log = baseLog.child({ module: 'vector' });

// モデルごとのプリセット設定 (Asymmetric Embedding用)
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

// モデルに適したプリフィックスを設定し埋め込みを実行する
function wrapWithPrefix(model, options, execute) {
	const key = Object.keys(PRESET_MAP).find(key => new RegExp(key, 'i').test(model));
	const presets = PRESET_MAP[key];
	const queryPrefix = options.queryPrefix || presets?.queryPrefix || '';
	const titlePrefix = options.documentTitlePrefix || presets?.documentTitlePrefix || '';
	const textPrefix = options.documentTextPrefix || presets?.documentTextPrefix || '';

	const embed = async inputs => {
		const isArray = Array.isArray(inputs);
		inputs = [].concat(inputs).map(s => s.trim());

		// 偶発的なエラー(メモリ割り当て失敗など)に対処するため縮小リトライする
		const results = [];
		const batchSizes = [16, 8, 1];
		let i = 0;
		while (i < inputs.length) {
			let batchSize = batchSizes[0];
			results.push(...(await retry(
				() => execute(inputs.slice(i, i + batchSize)),
				{
					maxAttempts: 3,
					module: 'vector',
					onRetry: (e, c) => batchSize = batchSizes[c],
				},
			)));
			i += batchSize;
		}

		return isArray ? results : results[0];
	};

	return {
		embedQuery: query => embed(queryPrefix + query, 'query'),
		embedDocument: documents => embed([].concat(documents).map(d => {
			const title = d.title;
			const text = typeof d === 'object' ? d.text : d;
			return [
				title && (titlePrefix + title),
				text && (textPrefix + text),
			].filter(Boolean).join('\n');
		})),
	};
}

const vector = {
	engine: null,
	model: '',
	contextSize: config['sentence.contextSize'] || 2048,
	_dimension: 0,
	_calibration: null,

	_createProgressReporter() {
		const logged = {};
		return (file, progress) => {
			const step = Math.floor(progress / 20) * 20;
			if (logged[file] === undefined || step > logged[file]) {
				logged[file] = step;
				log.info({ file, progress: step }, 'loading model file');
			}
		};
	},

	providers: {
		// Transformers.js(ONNX)
		async transformers({
			model = 'onnx-community/embeddinggemma-300m-ONNX',
			dtype = 'q8',
			device,
			contextSize = 2048,
			...options
		} = {}) {
			const { pipeline, env } = await import('@huggingface/transformers');

			env.cacheDir = config['sentence.cachePath'];
			env.logLevel = 'error';
			env.backends.onnx.logLevel = 'error';

			const targetDevice = device || { win32: 'dml', darwin: 'coreml' }[process.platform] || 'cpu';
			const reporter = vector._createProgressReporter();
			const onProgress = p => {
				if (p.status === 'progress')
					reporter(p.file, p.progress);
			};

			const extractor = await pipeline('feature-extraction', model, {
				dtype,
				device: targetDevice,
				progress_callback: onProgress,
				session_options: {
					execution_providers: [targetDevice, 'cpu'],
					enable_cpu_mem_arena: true,
					enable_mem_reuse: true,
					enable_mem_pattern: false,
					execution_mode: 'sequential',
					log_severity_level: 4,
					extra: {
						'session.set_denormal_as_zero': '1',
						'session.disable_metacommands': '1',
					},
				},
			});

			const engine = wrapWithPrefix(model, options, async inputs => {
				const out = await extractor(inputs, { pooling: 'mean', normalize: true, truncation: true });
				return out.tolist();
			});
			engine.contextSize = Math.min(contextSize,
				extractor.tokenizer?.model_max_length ||
				extractor.model?.config?.max_position_embeddings ||
				Infinity);

			engine.dispose = async () => {
				log.info('disposing transformers (onnx) context');
				await extractor.dispose();
			};

			return engine;
		},

		// node-llama-cpp(GGUF/Native)
		async llama({
			model = 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf',
			device = 'auto',
			contextSize = 2048,
			...options
		} = {}) {
			const { getLlama, createModelDownloader, LlamaLogLevel } = await import('node-llama-cpp');

			const llama = await getLlama({
				gpu: device,
				build: 'never',
				logLevel: LlamaLogLevel.error,
				gpuOptions: { vmm: false },
			});

			if (device !== 'cpu' && llama.gpu === false)
				log.warn({ requestedDevice: device }, 'GPU acceleration not available, falling back to CPU');

			const reporter = vector._createProgressReporter();
			const downloader = await createModelDownloader({
				modelUri: model,
				dirPath: config['sentence.cachePath'],
				onProgress: ({ downloadedSize, totalSize }) => {
					reporter(model, (downloadedSize / totalSize) * 100);
				},
			});
			const modelPath = await downloader.download();
			const llamaModel = await llama.loadModel({ modelPath });

			let context;
			contextSize = Math.min(contextSize, llamaModel.trainContextSize || Infinity);
			try {
				context = await llamaModel.createEmbeddingContext({ contextSize, flashAttention: true });
			} catch (e) {
				context = await llamaModel.createEmbeddingContext({ contextSize });
			}

			const normalize = v => {
				const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
				return v.map(x => x / (norm || 1));
			};

			const engine = wrapWithPrefix(model, options, async inputs => {
				const vecs = await Promise.all(inputs.map(t => {
					const tokens = llamaModel.tokenize(t);
					if (tokens.length > contextSize)
						t = llamaModel.detokenize(tokens.slice(0, contextSize - 16));
					return context.getEmbeddingFor(t);
				}));
				return vecs.map(v => normalize(Array.from(v.vector)));
			});
			engine.contextSize = contextSize;

			engine.dispose = async () => {
				log.info('disposing llama context');
				await context?.dispose();
				await llamaModel?.dispose();
				await llama?.dispose();
			};

			return engine;
		},

		// OpenAI Compatible API (Ollama, vLLM, OpenAI, etc.)
		async openai({
			model = 'embeddinggemma',
			url = 'http://localhost:11434/v1/embeddings',
			apiKey = '',
			...options
		} = {}) {
			return wrapWithPrefix(model, options, async inputs => {
				const headers = { 'Content-Type': 'application/json' };
				if (apiKey)
					headers['Authorization'] = `Bearer ${apiKey}`;

				const res = await fetch(url, {
					method: 'POST',
					headers,
					body: JSON.stringify({ model, input: inputs }),
				});
				const data = await res.json();
				return data.data.map(d => d.embedding);
			});
		},
	},

	async initialize() {
		const provider = config['sentence.provider'] || 'llama';
		if (provider === 'none')
			return;

		this.engine = await this.providers[provider].call(this.providers, {
			model: config[`sentence.${provider}.model`],
			dtype: config[`sentence.${provider}.dtype`],
			url: config[`sentence.${provider}.url`],
			apiKey: config[`sentence.${provider}.apiKey`],
			device: config['sentence.device'] === 'auto' ? undefined : config['sentence.device'],
			queryPrefix: config['sentence.queryPrefix'],
			documentTitlePrefix: config['sentence.documentTitlePrefix'],
			documentTextPrefix: config['sentence.documentTextPrefix'],
			contextSize: this.contextSize,
		});

		this.contextSize = this.engine.contextSize || this.contextSize;
		this.model = config[`sentence.${provider}.model`];
	},

	async getDimension() {
		if (this._dimension)
			return this._dimension;

		const [sample] = await this.engine.embedDocument([{ title: '', text: ' ' }]);
		return this._dimension = sample.length;
	},

	async getCalibration() {
		if (this._calibration)
			return this._calibration;

		const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
		const vecs = await Promise.all([
			this.embedQuery('cat'),
			this.embedDocument({ title: 'Animal', text: 'kitten' }),
			this.embedQuery('A round fruit with red, yellow, or green skin and a whitish inside.'),
			this.embedDocument({
				title: 'Space exploration',
				text: 'The exploration of outer space using spacecraft, with or without a human crew.',
			}),
		]);

		const near = 1 - dot(vecs[0], vecs[1][0]);
		const far = 1 - dot(vecs[2], vecs[3][0]);
		const threshold = (near + far) / 2;
		log.info({ near: near.toFixed(4), far: far.toFixed(4), threshold: threshold.toFixed(4) }, 'threshold calibrated');

		return this._calibration = { near, far, threshold };
	},

	async embedQuery(query) {
		if (!this.engine)
			throw new Error('Sentence Vector engine not initialized. Call initialize() first.');
		return this.engine.embedQuery(query);
	},

	async embedDocument(docs) {
		if (!this.engine)
			throw new Error('Sentence Vector engine not initialized. Call initialize() first.');
		return this.engine.embedDocument(docs);
	},

	async dispose() {
		this._dimension = 0;
		this._calibration = null;

		await this.engine?.dispose?.();
		this.engine = null;
	},
};

export default vector;
