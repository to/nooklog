import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// どんなディレクトリから実行しても、絶対に見落とさない「最強の .env 読み込み」！✨
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const isProduction = process.env.NODE_ENV === 'production';
const target = isProduction ? 'pino/file' : 'pino-pretty';
const prettyOpts = !isProduction ? {
	colorize: false,
	translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
	ignore: 'pid,hostname,module',
	messageFormat: '{module}: {msg}',
	singleLine: true,
} : {};

const log = pino({
	level: process.env.PINO_LOG_LEVEL || 'info',
	serializers: {
		error: pino.stdSerializers.err,
	},
	transport: {
		targets: [
			// 通常ログ：stdout (1) へ全レベルを出力
			{ level: 'trace', target, options: { destination: 1, ...prettyOpts } },
			// エラーログ：stderr (2) へ error 以上のみを出力
			{ level: 'error', target, options: { destination: 2, ...prettyOpts } },
		],
	},
});

export default log;
