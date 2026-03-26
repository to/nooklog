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
		inputs = [].concat(inputs);

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

export const providers = {
	// Transformers.js(ONNX)
	// (embeddinggemma(fp16)/dmlなど組み合わせにより計算不能になることがあるので注意)
	async transformers({
		model = 'onnx-community/embeddinggemma-300m-ONNX',
		dtype = 'q8',
		device,
		...options
	} = {}) {
		const { pipeline, env } = await import('@huggingface/transformers');

		// Transformers.js 設定
		env.cacheDir = config['sentence.cachePath'];
		env.logLevel = 'error'; //  Transformers.js ログ(ダウンロード状況/キャッシュ確認)
		env.backends.onnx.logLevel = 'error'; // ONNX Runtime ログ

		const targetDevice = device || { win32: 'dml', darwin: 'coreml' }[process.platform] || 'cpu';
		const logged = {};
		const onProgress = p => {
			if (p.status !== 'progress')
				return;

			const step = Math.floor(p.progress / 20) * 20;
			if (step > (logged[p.file] || 0)) {
				logged[p.file] = step;
				log.info({ file: p.file, progress: step }, 'loading model file');
			}
		};

		// 安定性を重視した設定
		const extractor = await pipeline('feature-extraction', model, {
			dtype,
			device: targetDevice,
			progress_callback: onProgress,
			session_options: {
				execution_providers: [targetDevice, 'cpu'],
				enable_cpu_mem_arena: true, // メモリの効率化
				enable_mem_reuse: true, // メモリの再利用
				enable_mem_pattern: false, // メモリ計画(安定性重視)
				execution_mode: 'sequential', // 逐次実行
				log_severity_level: 4, // エラーのみ
				extra: {
					'session.set_denormal_as_zero': '1', // 浮動小数点演算を高速化
					'session.disable_metacommands': '1', // 最適化を無効にして安定化
				},
			},
		});

		return wrapWithPrefix(model, options, async inputs => {
			const out = await extractor(inputs, { pooling: 'mean', normalize: true, truncation: true });
			return out.tolist();
		});
	},

	// node-llama-cpp(GGUF/Native)
	async llama({
		model = 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf',
		device = 'auto',
		...options
	} = {}) {
		const { getLlama, createModelDownloader, LlamaLogLevel } = await import('node-llama-cpp');

		const llama = await getLlama({
			gpu: device,
			build: 'autoAttempt',
			logLevel: LlamaLogLevel.error,
			gpuOptions: { vmm: false },
		});

		if (device !== 'cpu' && llama.gpu === false)
			log.warn({ requestedDevice: device }, 'GPU acceleration not available, falling back to CPU');

		const modelPath = await (
			await createModelDownloader({
				modelUri: model,
				dirPath: config['sentence.cachePath'],
			})).download();
		const llamaModel = await llama.loadModel({ modelPath });

		const contextSize = 2048;
		let context;
		try {
			context = await llamaModel.createEmbeddingContext({ contextSize: contextSize, flashAttention: true });
		} catch (e) {
			context = await llamaModel.createEmbeddingContext({ contextSize: contextSize });
		}

		const normalize = v => {
			const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
			return v.map(x => x / (norm || 1));
		};

		return wrapWithPrefix(model, options, async inputs => {
			const vecs = await Promise.all(inputs.map(t => {
				// 最大サイズへ切り詰める
				const tokens = llamaModel.tokenize(t);
				if (tokens.length > contextSize)
					t = llamaModel.detokenize(tokens.slice(0, contextSize - 16));
				return context.getEmbeddingFor(t);
			}));
			return vecs.map(v => normalize(Array.from(v.vector)));
		});
	},

	// OpenAI Compatible API (Ollama, vLLM, OpenAI, etc.)
	async openai({
		model = 'embeddinggemma',
		endpoint = 'http://localhost:11434/v1/embeddings',
		apiKey = '',
		...options
	} = {}) {
		return wrapWithPrefix(model, options, async inputs => {
			const headers = { 'Content-Type': 'application/json' };
			if (apiKey)
				headers['Authorization'] = `Bearer ${apiKey}`;

			const res = await fetch(endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify({ model, input: inputs }),
			});
			const data = await res.json();
			return data.data.map(d => d.embedding);
		});
	},
};

// 指定されたプロバイダーで初期化
const provider = config['sentence.provider'] || 'llama';
const engine = await providers[provider].call(providers, {
	model: config[`sentence.${provider}.model`],
	dtype: config[`sentence.${provider}.dtype`],
	endpoint: config[`sentence.${provider}.url`],
	apiKey: config[`sentence.${provider}.apiKey`],
	device: config['sentence.device'] === 'auto' ? undefined : config['sentence.device'],
	queryPrefix: config['sentence.queryPrefix'],
	documentTitlePrefix: config['sentence.documentTitlePrefix'],
	documentTextPrefix: config['sentence.documentTextPrefix'],
});

export const embedQuery = engine.embedQuery;
export const embedDocument = engine.embedDocument;

// Calibrate threshold dynamically
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const vecs = await Promise.all([
	embedQuery('cat'),
	embedDocument({ title: 'Animal', text: 'kitten' }),
	embedQuery('A round fruit with red, yellow, or green skin and a whitish inside.'),
	embedDocument({ title: 'Space exploration', text: 'The exploration of outer space using spacecraft, with or without a human crew.' }),
]);

const near = 1 - dot(vecs[0], vecs[1][0]);
const far = 1 - dot(vecs[2], vecs[3][0]);
const threshold = (near + far) / 2;
log.info({ near: near.toFixed(4), far: far.toFixed(4), threshold: threshold.toFixed(4) }, 'threshold calibrated');

const [sample] = await engine.embedDocument([{ title: '', text: ' ' }]);
export const vector = {
	model: config[`sentence.${provider}.model`],
	dimension: sample.length,
	threshold,
};
