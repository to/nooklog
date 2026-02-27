import pino from 'pino';

const logger = pino({
	level: process.env.PINO_LOG_LEVEL || 'info',
	transport: process.env.NODE_ENV === 'development' ? {
		target: 'pino-pretty',
		options: {
			colorize: false,
			translateTime: 'yyyy-mm-dd HH:MM:ss.l',
			ignore: 'pid,hostname',
		},
	} : undefined,
});

export default logger;
