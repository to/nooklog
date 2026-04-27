import 'dotenv/config';
import crypto from 'node:crypto';
import express, { response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AssetCache from 'express-asset-file-cache-middleware';
import { rateLimit } from 'express-rate-limit';
import basicAuth from 'express-basic-auth';

// Load config from database
import database from './core/database.js';
import config from './core/config.js';

import nooklog from './core/nooklog.js';
import baseLog from './core/log.js';
import _, { Warning } from './core/util.js';
import { router } from './router.js';
import { RPCHandler } from '@orpc/server/node';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { onError, ORPCError } from '@orpc/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter, experimental_ZodSmartCoercionPlugin as ZodSmartCoercionPlugin } from '@orpc/zod/zod4';

const log = baseLog.child({ module: 'server' });

const logFailure = (error, message, context = {}) => {
	if (error instanceof Warning)
		log.warn({ ...context, cause: error.message }, message);
	else
		log.error({ ...context, cause: error }, message);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = express();

/* ---- Server Framework Setup ---- */

server.set('json spaces', '\t');
server.set('trust proxy', 1);
server.use(express.json({ limit: '500mb' }));

server.use((req, res, next) => {
	log.trace({ method: req.method, url: req.url }, 'request received');

	// Tighten security in iframe to ease opening
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
	if (req.query.view === 'embed') {
		res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	}
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	next();
});

/* ---- Dynamic Basic Authentication ---- */

// Rate limiter tracking only incorrect password inputs
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100, // Calculated based on required resources (HTML/JS/CSS) (for slow networks)
	skipSuccessfulRequests: true, // Do not count correct passwords
	message: 'Too many failed login attempts. Please try again after 15 minutes.',
	standardHeaders: true,
	legacyHeaders: false,
});

// Basic Auth middleware
const basicAuthenticator = basicAuth({
	authorizer: (user, pass) => {
		const stored = config['server.password'];
		if (!stored)
			return true;

		// Safe compare to avoid timing attacks
		const [salt, storedHash] = stored.split(':');
		const hash = crypto.createHash('sha256').update(pass + salt).digest('hex');
		return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
	},
	challenge: true,
	realm: 'Nooklog',
});

server.use((req, res, next) => {
	const password = config['server.password'];
	if (!password || req.path === '/api/alive' || req.path.startsWith('/api/favicon'))
		return next();

	// Apply rate limit
	authLimiter(req, res, () => {
		basicAuthenticator(req, res, next);
	});
});

/* ---- Static File Server ---- */

server.use(express.static(path.join(__dirname, '../public'), {
	index: 'home.html',
	setHeaders: (res, path) => {
		if (path.endsWith('.woff2'))
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
	},
}));

/* ---- Favicon Proxy & Cache ---- */

const faviconCacheDir = path.join(config['server.data.path'], 'favicon');
if (!fs.existsSync(faviconCacheDir))
	fs.mkdirSync(faviconCacheDir, { recursive: true });

const assetCache = AssetCache({
	cacheDir: faviconCacheDir,
	maxSize: 10 * 1024 * 1024, // 10MB
});

server.get('/api/favicon',
	(req, res, next) => {
		const domain = req.query.domain;
		if (!domain)
			return res.status(400).send('Missing domain');

		req.url = `/${domain}`;
		res.locals.fetchUrl = `https://www.google.com/s2/favicons?sz=16&domain=${domain}`;
		next();
	},
	assetCache,
	(req, res) => {
		res.set({
			'Content-Type': res.locals.contentType || 'image/png',
			'Content-Length': res.locals.contentLength,
			'Cache-Control': 'public, max-age=86400',
			'Cross-Origin-Resource-Policy': 'cross-origin',
		});
		res.end(res.locals.buffer, 'binary');
	},
);

/* ---- Component Loader ---- */

server.get('/component/:component/:name.html.js', async (req, res) => {
	const { component, name } = req.params;

	// Allow safe characters for filenames (strict alphabetical)
	if (!/^[a-z]+$/i.test(component) || !/^[a-z]+$/i.test(name))
		return res.status(400).send('Invalid component name');

	const filePath = path.join(__dirname, '../public/component', component, `${name}.html`);

	const stat = await fs.promises.stat(filePath);
	const mtime = stat.mtime;
	if (req.header('If-Modified-Since') && mtime <= new Date(req.header('If-Modified-Since')))
		return res.status(304).end();

	let html = await fs.promises.readFile(filePath, 'utf8');
	html = html.replace(/`/g, '\\`').replace(/\$/g, '\\$');

	res.setHeader('Last-Modified', mtime.toUTCString());
	res.setHeader('Cache-Control', 'no-cache');
	res.type('javascript');
	res.send(`window.${name}_html = \`${html}\`;`);
});

/* ---- Mount Nooklog Application Routes (oRPC) ---- */

// Accept HTML or Text files
server.post(['/api/import', '/rpc/import'],
	express.text({ type: '*/*', limit: '500mb' }));

server.get('/api/alive', (req, res) => res.end());

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
server.all('/rpc*', async (request, response, next) => {
	const { matched } = await rpcHandler.handle(request, response, {
		prefix: '/rpc',
		context: { request, response },
	});
	if (matched)
		return;
	next();
});

server.all('/api*', async (request, response, next) => {
	const { matched } = await openapiHandler.handle(request, response, {
		prefix: '/api',
		context: { request, response },
	});
	if (matched)
		return;
	next();
});

// Dynamic OpenAPI spec generation
let cachedOpenAPI = null;
server.get('/openapi.json', async (req, res) => {
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
		});
	}
	res.json(cachedOpenAPI);
});

/* ---- Server Lifecycle ---- */

// Allow some delay after SIGINT from pm2 restart
if (process.env.restart_time > 0)
	await _.wait(2000);

await database.initialize();
await nooklog.initialize();

const instance = server.listen(config['server.port'], '::', async () => {
	log.info({ port: config['server.port'], host: '::' }, 'server started');
});

// Graceful Shutdown
let shutdown = async signal => {
	shutdown = () => { };

	log.info({ signal }, 'shutdown signal received');

	// Wait for HTTP server to stop
	instance?.closeAllConnections();
	if (instance)
		await new Promise(resolve => instance.close(resolve));
	log.info('http server closed');

	// Release resources
	await nooklog.dispose();
	log.info('nooklog disposed successfully');

	process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', msg => {
	if (msg === 'shutdown')
		shutdown('PM2 shutdown message');
});

process.on('uncaughtException', error => {
	logFailure(error, 'uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
	logFailure(reason, 'unhandled rejection');
});
