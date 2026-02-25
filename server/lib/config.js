import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import _ from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../nookmark.config.json');

// デフォルト設定
let config = {
	'server.port': 5050,
	'server.data.path': path.join(os.homedir(), '.nookmark', 'data'),
	'database.tokenizer': '', // 'n-gram', 'standard'
	'database.contentsFormat': 'both', // 'markdown', 'html', 'both'
	'database.recentThresholdDays': 7,
	'database.optimization.maxSmallFragments': 100,
	'database.optimization.versionRetentionDays': 7,
	'client.theme': 'system', // 'light', 'dark', 'system'
	'client.windowPosition': 'bottom-right', // 'top-right', 'bottom-right'
	'client.tagMatchMode': 'smart', // 'smart'（飛び石）, 'contains'（部分一致）, 'starts-with'（前方一致）
	'client.ratingInputMode': 'both', // 'stars', 'tags', 'both'
	'client.autoCompleteTags': true, // 1つに絞られたら自動確定するかどうか
	'client.normalizeFullWidth': true, // 全角の（）や／を半角に自動変換するか
	'extension.serverAddress': 'http://localhost:5050',
	'extension.selectionDelimiter': '/',
	'extension.autoAppendSelection': true,
	'extension.openSearchInForeground': true,
	'extension.focusMemoOnSelection': false,
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
} else {
	// 新規作成
	config.save();
}

console.log('config: ', config);

export default config;
