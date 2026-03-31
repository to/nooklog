import 'dotenv/config';

// WindowsでPM2等によりデーモン起動した際、余計なコンソールウィンドウが出るのを抑制する
if (process.stdin.isTTY)
	process.stdin.unref();

import express, { response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AssetCache from 'express-asset-file-cache-middleware';

import config from './core/config.js';
import nooklog from './core/nooklog.js';
import baseLog from './core/log.js';
import { router } from './router.js';
import { RPCHandler } from '@orpc/server/node';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { onError } from '@orpc/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter, experimental_ZodSmartCoercionPlugin as ZodSmartCoercionPlugin } from '@orpc/zod/zod4';

const log = baseLog.child({ module: 'server' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = express();

/* ---- Server Framework Setup ---- */

server.set('json spaces', '\t');
server.use(express.json({ limit: '500mb' }));

server.use((req, res, next) => {
	log.trace({ method: req.method, url: req.url }, 'request received');

	// iframeの中でセキュリティを厳しくし開きやすくする
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
	if (req.query.embed === 'true') {
		res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
		res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	}
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	next();
});

/* ---- Dynamic Basic Authentication ---- */

server.use((req, res, next) => {
	const password = config['server.password'];
	if (!password || req.path === '/api/alive' || req.path.startsWith('/api/favicon'))
		return next();

	// ユーザー名は問わない
	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.startsWith('Basic ')) {
		const [_, pass] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
		if (pass === password)
			return next();
	}

	res.setHeader('WWW-Authenticate', 'Basic realm="Nooklog"');
	res.status(401).send('Authentication required');
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

// HTMLやテキストファイルを受け取る
server.post(['/api/import', '/rpc/import'],
	express.text({ type: '*/*', limit: '500mb' }));

server.get('/api/alive', (req, res) => res.end());

const sharedInterceptors = [
	onError((error, { request }) => {
		log.error({
			method: request.method,
			url: request.url,
			error,
		}, 'API request failed');
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
		});
	}
	res.json(cachedOpenAPI);
});

/* ---- Server Lifecycle ---- */

const instance = server.listen(config['server.port'], async () => {
	log.info({ url: `http://localhost:${config['server.port']}` }, 'server started');

	// pm2 restartによるSIGINTから 少し時間を置く
	setTimeout(() => {
		nooklog.initialize();
	}, process.env.restart_time > 0 ? 2 * 1000 : 0);
});

// Graceful Shutdown
let shutdown = async signal => {
	shutdown = () => { };

	log.info({ signal }, 'shutdown signal received');

	// HTTPサーバー停止を待つ
	instance.closeAllConnections();
	await new Promise(resolve => instance.close(resolve));
	log.info('http server closed');

	// リソースの破棄(Llama/DB)
	await nooklog.dispose();
	log.info('nooklog disposed successfully');

	// 絶対にSIGINT/SIGKILL/exit(0)を行わないこと
	// (shutdownに反応せずPM2を待たせる)
	if (!process.env.pm_uptime)
		process.kill(process.pid, 'SIGINT');
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', msg => {
	if (msg === 'shutdown')
		shutdown('PM2 shutdown message');
});

process.on('uncaughtException', error => {
	log.error({ error }, 'uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
	log.error({ error: reason, promise }, 'unhandled rejection');
});
