import pino from 'pino';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

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
		target,
		options: { destination: 1, ...prettyOpts },
	},
});

export default log;
