import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import _ from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = path.join(__dirname, '../default.config.js');
const USER_CONFIG = path.join(__dirname, '../../user.config.js');

// 設定ファイルがなければコピー
try {
	fs.copyFileSync(DEFAULT_CONFIG, USER_CONFIG, fs.constants.COPYFILE_EXCL);
} catch {
}

// 設定を読み込みマージする
let config;
try {
	config = _.merge(
		(await import('file://' + DEFAULT_CONFIG)).default,
		(await import('file://' + USER_CONFIG)).default);
} catch (e) {
	// アプリケーションを終了する
	throw new Error('Failed to load config', { cause: e });
}

// パスを解決する
if (!path.isAbsolute(config.database.path))
	config.database.path = path.resolve(__dirname, '../../', config.database.path);

export default config;
