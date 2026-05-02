import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import cachedFetch from 'make-fetch-happen';
import { RPCHandler } from '@orpc/server/fastify';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { onError, ORPCError } from '@orpc/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import {
	ZodToJsonSchemaConverter,
	experimental_ZodSmartCoercionPlugin as ZodSmartCoercionPlugin,
} from '@orpc/zod/zod4';

// Load config from database
import database from './core/database.js';
import config from './core/config.js';

import nooklog from './core/nooklog.js';
import baseLog from './core/log.js';
import _, { Warning } from './core/util.js';
import { router } from './router.js';

const log = baseLog.child({ module: 'server' });

const logFailure = (error, message, context = {}) => {
	if (error instanceof Warning)
		log.warn({ ...context, cause: error.message }, message);
	else
		log.error({ ...context, error }, message);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = Fastify({
	logger: false,
	trustProxy: true,
	forceCloseConnections: true,
	bodyLimit: 500 * 1024 * 1024, // 500MB
});

/* ---- Security Headers / CORS ---- */

server.addHook('onRequest', async (request, reply) => {
	reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
	if (request.query.view === 'embed') {
		reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
		reply.header('Cross-Origin-Opener-Policy', 'same-origin');
	}
	reply.header('Access-Control-Allow-Origin', '*');
	reply.header('Access-Control-Allow-Private-Network', 'true');
});

/* ---- Authentication & Rate Limit ---- */

await server.register(fastifyRateLimit, {
	max: 5,
	timeWindow: '15 minutes',
	allowList: req => checkAuth(req)
		|| req.url === '/api/alive'
		|| req.url.startsWith('/api/favicon'),
	errorResponseBuilder: (request, context) => {
		log.warn({ ip: request.ip, url: request.url }, 'Rate limit exceeded');
		return {
			statusCode: 429,
			error: 'Too Many Requests',
			message: `Rate limit exceeded. Try again in ${context.after}`,
		};
	},
});

server.addHook('preHandler', async (request, reply) => {
	if (checkAuth(request)
		|| request.url === '/api/alive'
		|| request.url.startsWith('/api/favicon'))
		return;

	reply.header('WWW-Authenticate', 'Basic realm="Nooklog"');
	reply.status(401).send('Unauthorized');
});

function checkAuth(request) {
	if (request.isAuthorized !== undefined)
		return request.isAuthorized;

	const passwordStored = config['server.password'];
	const apiKeyStored = config['server.apiKey'];

	// If no password is set, the server is public
	if (!passwordStored)
		return request.isAuthorized = true;

	const authHeader = request.headers.authorization;
	const apiKeyHeader = request.headers['x-api-key'];

	// Check API Key (Header: x-api-key or Bearer token)
	if (apiKeyStored) {
		if (apiKeyHeader === apiKeyStored)
			return request.isAuthorized = true;

		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7).trim();
			if (token === apiKeyStored)
				return request.isAuthorized = true;
		}
	}

	if (!authHeader)
		return request.isAuthorized = false;

	// Check Basic Auth (Header: Authorization: Basic <base64>)
	if (passwordStored && authHeader.startsWith('Basic ')) {
		try {
			const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
			const [_, password] = credentials.split(':');
			const [salt, storedHash] = passwordStored.split(':');
			const hash = crypto.createHash('sha256')
				.update(password + salt).digest('hex');
			return request.isAuthorized = crypto.timingSafeEqual(
				Buffer.from(hash), Buffer.from(storedHash));
		} catch {
			return request.isAuthorized = false;
		}
	}

	return request.isAuthorized = false;
}

/* ---- Static File Server ---- */

await server.register(fastifyStatic, {
	root: path.join(__dirname, '../public'),
	index: 'home.html',
	setHeaders: (res, filePath) => {
		if (filePath.endsWith('.woff2')) {
			res.setHeader('Cache-Control',
				'public, max-age=31536000, immutable');
		}
	},
});

/* ---- Favicon Proxy & Cache ---- */

const faviconCacheDir = path.join(config['server.data.path'], 'favicon');

server.get('/api/favicon', async (request, reply) => {
	const { domain } = request.query;
	if (!domain)
		return reply.status(400).send('Missing domain');

	const src = `https://www.google.com/s2/favicons`
		+ `?sz=16&domain=${domain}`;
	const response = await cachedFetch(src, {
		cachePath: faviconCacheDir,
	});
	const buffer = await response.buffer();
	reply.header('Cache-Control', 'public, max-age=86400');
	reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
	reply.type(response.headers.get('content-type') || 'image/png');
	return buffer;
});

/* ---- Component Loader ---- */

server.get('/component/:component/:name.html.js',
	async (request, reply) => {
		const { component, name } = request.params;

		// Allow safe characters for filenames (strict alphabetical)
		if (!/^[a-z]+$/i.test(component) || !/^[a-z]+$/i.test(name))
			return reply.status(400).send('Invalid component name');

		const filePath = path.join(__dirname,
			'../public/component', component, `${name}.html`);

		const stat = await fs.promises.stat(filePath);
		if (request.headers['if-modified-since']
			&& stat.mtime <= new Date(
				request.headers['if-modified-since']))
			return reply.status(304).send();

		let html = await fs.promises.readFile(filePath, 'utf8');
		html = html.replace(/`/g, '\\`').replace(/\$/g, '\\$');

		reply.header('Last-Modified', stat.mtime.toUTCString());
		reply.header('Cache-Control', 'no-cache');
		reply.type('application/javascript');
		return `window.${name}_html = \`${html}\`;`;
	});

/* ---- Mount Application Routes (oRPC) ---- */

// Let oRPC parse the body
server.addContentTypeParser('text/html', { parseAs: 'string' }, (request, payload, done) => {
	done(null, payload);
});

server.addContentTypeParser(
	'*', (request, payload, done) => done(null, undefined));

server.get('/api/alive', async () => '');

const sharedInterceptors = [
	onError((error, { request }) => {
		logFailure(error, 'API request failed', {
			method: request.method,
			url: request.url,
		});

		// Send error details to client
		if (!(error instanceof ORPCError)) {
			throw new ORPCError(error.message, {
				cause: error,
			});
		}
	}),
];

const sharedPlugins = [new ZodSmartCoercionPlugin()];

const rpcHandler = new RPCHandler(router, {
	interceptors: sharedInterceptors,
	plugins: sharedPlugins,
});

const openapiHandler = new OpenAPIHandler(router, {
	interceptors: sharedInterceptors,
	plugins: sharedPlugins,
});

// oRPC Handlers
server.all('/rpc/*', async (request, reply) => {
	const { matched } = await rpcHandler.handle(request, reply, {
		prefix: '/rpc',
		context: { request: request.raw, response: reply.raw },
	});
	if (!matched)
		reply.status(404).send('Not found');
});

server.all('/api/*', async (request, reply) => {
	const { matched } = await openapiHandler.handle(request, reply, {
		prefix: '/api',
		context: { request: request.raw, response: reply.raw },
	});
	if (!matched)
		reply.status(404).send('Not found');
});

// Dynamic OpenAPI spec generation
let cachedOpenAPI = null;
server.get('/openapi.json', async () => {
	if (!cachedOpenAPI) {
		const generator = new OpenAPIGenerator({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		});
		cachedOpenAPI = await generator.generate(router, {
			info: {
				title: 'Nooklog API',
				version: '1.0.0',
			},
			servers: [{ url: '/api' }],
			filter: ({ contract }) => !contract['~orpc'].route.tags?.includes('internal'),
			components: {
				securitySchemes: {
					apiKey: {
						type: 'apiKey',
						in: 'header',
						name: 'x-api-key',
					},
					bearer: {
						type: 'http',
						scheme: 'bearer',
					},
					basic: {
						type: 'http',
						scheme: 'basic',
					},
				},
			},
			security: [{ apiKey: [] }, { bearer: [] }, { basic: [] }],
		});
	}
	return cachedOpenAPI;
});

/* ---- Server Lifecycle ---- */

await database.initialize();
await nooklog.initialize();

await server.listen({
	port: config['server.port'],
	host: '::',
});
log.info({ port: config['server.port'], host: '::' }, 'server started');

// Graceful Shutdown
let shutdown = async signal => {
	shutdown = () => { };
	log.info({ signal }, 'shutdown signal received');

	await nooklog.dispose();
	await server.close();

	log.info('shutdown complete');
	process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', msg => {
	log.info({ msg }, 'process received message');
	if (msg === 'shutdown')
		shutdown('PM2 shutdown message');
});

process.on('uncaughtException', error => {
	logFailure(error, 'uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
	logFailure(reason, 'unhandled rejection');
});
