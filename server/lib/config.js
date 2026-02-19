import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import _ from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../nookmark.config.json');

// デフォルト設定
let config = {
	'server': {
		'port': 5050,
	},
	'database': {
		'path': 'data/lancedb',
		'recentThresholdDays': 7,
		'optimization': {
			'maxSmallFragments': 100,
			'keepVersionsDays': 7,
		},
	},
};

Object.defineProperty(config, 'save', {
	value: function () {
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(this, null, '\t'));
	},
	enumerable: false,
});

// 設定ファイルがあれば読み込んでマージ
if (fs.existsSync(CONFIG_PATH)) {
	try {
		config = _.merge(config,
			JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')));
	} catch (e) {
		// JSONパースエラーなど致命的な場合は起動しない
		throw new Error(`Failed to read config file: ${CONFIG_PATH}`, { cause: e });
	}
} else {
	config.save();
}

console.log('config: ', config);

export default config;
