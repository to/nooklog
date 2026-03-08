import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';
const target = isDev ? 'pino-pretty' : 'pino/file';
const prettyOpts = isDev ? {
	colorize: false,
	translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
	ignore: 'pid,hostname,module',
	messageFormat: '{module}: {msg}',
	singleLine: true,
} : {};

const logger = pino({
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

export default logger;
