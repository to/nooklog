import path from 'path';
import os from 'os';
import crypto from 'crypto';

const dataPath = process.env.NOOKLOG_DATA_PATH || (
	process.platform === 'linux'
		? path.join(process.cwd(), 'data')
		: path.join(os.homedir(), '.nooklog', 'data'));

const config = {
	'client.theme': 'system', // 'light', 'dark', 'system'
	'client.tint': 'cyan', // 'red', 'pink', etc.
	'client.windowPosition': 'bottom-right', // 'top-right', 'bottom-right'
	'client.tagMatchMode': 'smart', // 'smart' (subsequence), 'contains', 'starts-with'
	'client.ratingInputMode': 'both', // 'stars', 'tags', 'both'
	'client.autoCompleteTags': false, // Auto-confirm when narrowed down enough
	'extension.serverAddress': 'http://localhost:5050',
	'extension.selectionDelimiter': '/',
	'extension.autoAppendSelection': true,
	'extension.openSearchInForeground': true,
	'extension.focusMemoOnSelection': false,
	'server.port': 5050,
	'server.password': '',
	'sentence.vector.enabled': false,
	'sentence.vector.queryPrefix': '', // Use preset if empty
	'sentence.vector.documentTitlePrefix': '', // Use preset if empty
	'sentence.vector.documentTextPrefix': '', // Use preset if empty
	'sentence.vector.url': 'http://localhost:11434/v1/embeddings',
	'sentence.vector.apiKey': '',
	'sentence.vector.model': 'embeddinggemma',
	'sentence.vector.limitSize': 2048,
	'database.searchLimit': 300,
	'database.tokenizer': 'word', // 'word', 'unigram'
	'database.saveHTML': false,
};

export const env = {
	'server.mode': process.env.NOOKLOG_READONLY ? 'readonly' :
		(process.env.NOOKLOG_DEMO ? 'demo' : 'normal'),
	'server.readonly': !!(process.env.NOOKLOG_DEMO || process.env.NOOKLOG_READONLY),
	'server.data.path': dataPath,
	'server.port': process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
	'server.password': process.env.NOOKLOG_PASSWORD
		? `env-salt:${crypto.createHash('sha256').update(process.env.NOOKLOG_PASSWORD + 'env-salt').digest('hex')}`
		: undefined,
	'sentence.vector.url': process.env.NOOKLOG_VECTOR_URL || process.env.OPENAI_BASE_URL,
	'sentence.vector.apiKey': process.env.NOOKLOG_VECTOR_API_KEY || process.env.OPENAI_API_KEY,
	'database.turso.url': process.env.TURSO_DATABASE_URL,
	'database.turso.token': process.env.TURSO_AUTH_TOKEN,
	'database.turso.replica': process.env.TURSO_REPLICA === 'true',
};

export default new Proxy({}, {
	get(target, prop) {
		if (prop === 'setConfig') {
			return values => {
				// 保存対象の値のみを更新する
				for (const [k, v] of Object.entries(values || {})) {
					if (k in config && env[k] === undefined)
						config[k] = v;
				}
			};
		}

		if (prop === 'getConfig')
			return () => config;

		return env[prop] ?? config[prop];
	},
	ownKeys() {
		return Array.from(new Set([...Object.keys(config), ...Object.keys(env)]));
	},
	getOwnPropertyDescriptor(target, prop) {
		const desc = Object.getOwnPropertyDescriptor(env, prop) || Object.getOwnPropertyDescriptor(config, prop);
		if (desc)
			return { ...desc, enumerable: true, configurable: true };
	},
});
