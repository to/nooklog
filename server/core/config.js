import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import _ from './util.js';
import baseLog from './log.js';

const log = baseLog.child({ module: 'config' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../nooklog.config.json');

// デフォルト設定
let config = {
	'client.theme': 'system', // 'light', 'dark', 'system'
	'client.tint': 'grass', // 'red', 'pink', etc.
	'client.windowPosition': 'bottom-right', // 'top-right', 'bottom-right'
	'client.tagMatchMode': 'smart', // 'smart'（飛び石）, 'contains'（部分一致）, 'starts-with'（前方一致）
	'client.ratingInputMode': 'both', // 'stars', 'tags', 'both'
	'client.autoCompleteTags': false, // 充分に絞られたら自動確定するかどうか
	'client.normalizeFullWidth': false, // 全角の（）や／を半角に自動変換するか
	'extension.serverAddress': 'http://localhost:5050',
	'extension.selectionDelimiter': '/',
	'extension.autoAppendSelection': true,
	'extension.openSearchInForeground': true,
	'extension.focusMemoOnSelection': false,
	'server.port': 5050,
	'server.data.path': path.join(os.homedir(), '.nooklog', 'data'),
	'sentence.provider': 'llama', // 'llama', 'transformers', 'openai'
	'sentence.device': 'auto',
	'sentence.cachePath': path.join(os.homedir(), '.nooklog', 'data', '.cache'),
	'sentence.queryPrefix': '', // 空文字ならプリセットを使用
	'sentence.documentTitlePrefix': '', // 空文字ならプリセットを使用
	'sentence.documentTextPrefix': '', // 空文字ならプリセットを使用
	'sentence.llama.model': 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf',
	'sentence.transformers.model': 'onnx-community/embeddinggemma-300m-ONNX',
	'sentence.transformers.dtype': 'q8',
	'sentence.openai.model': 'embeddinggemma',
	'sentence.openai.url': 'http://localhost:11434/v1/embeddings',
	'sentence.openai.apiKey': '',
	'database.searchLimit': 300,
	'database.saveHTML': false,
};

Object.defineProperty(config, 'save', {
	value: function (values) {
		if (values)
			Object.assign(this, values);
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(this, null, '\t'));
	},
	enumerable: false,
});

// 設定ファイルがあれば読み込んでマージ
if (fs.existsSync(CONFIG_PATH)) {
	try {
		Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')));
	} catch (e) {
		// JSONパースエラーなど致命的なため起動しない
		throw new Error(`Failed to read config file: ${CONFIG_PATH}`, { cause: e });
	}
}

config.save();

export default config;
