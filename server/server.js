import 'dotenv/config';
import _ from './lib/util.js';
import express from 'express';
import { z } from 'zod';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AssetCache from 'express-asset-file-cache-middleware';

import config from './lib/config.js';
import nooklog from './lib/nooklog.js';
import ingester from './lib/ingester/index.js';
import baseLogger from './lib/logger.js';
import archiver from 'archiver';

const logger = baseLogger.child({ module: 'server' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ---- Server ---- */

// アプリケーションよりも先に記述する
app.set('json spaces', '\t');
app.use(express.json({ limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../public'), {
	index: 'home.html',
	setHeaders: (res, path) => {
		if (path.endsWith('.woff2'))
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
	},
}));

app.use((req, res, next) => {
	logger.trace({ method: req.method, url: req.url }, 'request received');

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

const cacheDir = path.join(config['server.data.path'], 'favicon');
if (!fs.existsSync(cacheDir))
	fs.mkdirSync(cacheDir, { recursive: true });

const assetCache = AssetCache({
	cacheDir,
	maxSize: 10 * 1024 * 1024, // 10MB
});

app.get('/api/favicon',
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

// HTMLパーツをスクリプトとして送信する
app.get('/component/:component/:name.html.js', async (req, res) => {
	const { component, name } = req.params;
	const filePath = path.join(__dirname, '../public/component', component, `${name}.html`);

	const stat = await fs.promises.stat(filePath);

	// ファイルに変更がないか？
	const mtime = stat.mtime;
	if (req.header('If-Modified-Since') &&
		mtime <= new Date(req.header('If-Modified-Since')))
		return res.status(304).end();

	let html = await fs.promises.readFile(filePath, 'utf8');
	html = html.replace(/`/g, '\\`').replace(/\$/g, '\\$');

	res.setHeader('Last-Modified', mtime.toUTCString());
	res.setHeader('Cache-Control', 'no-cache');
	res.type('javascript');
	res.send(`window.${name}_html = \`${html}\`;`);
});

// 予期せぬエラーを捕捉し、プロセスの停止を防ぐ
process.on('unhandledRejection', (reason, promise) => {
	logger.error({ error: reason, promise }, 'unhandled rejection');
});

/* ---- Nooklog ---- */

app.get('/api/tags', handle(async (req, res, ps) => {
	res.json(await nooklog.getTags());
}));

app.get('/api/search', handle(async (req, res, ps) => {
	res.json(await nooklog.search(ps));
}));

app.get('/api/bookmarks', handle(async (req, res, ps) => {
	res.json(ps.url ?
		await nooklog.findByUrl(ps.url) :
		await nooklog.getRecent(ps));
}));

app.get('/api/bookmarks/:id', handle(async (req, res, ps) => {
	res.json(await nooklog.findById(ps.id));
}));

app.post('/api/bookmarks/:id?', handle(async (req, res, ps) => {
	// 新規作成の場合はURLが必須
	if (!ps.id && !ps.url)
		return res.status(400).json({ error: 'Missing id or url' });

	res.json(await nooklog.upsert(ps));
}));

app.post('/api/import/bookmarks', express.text({ type: '*/*', limit: '100mb' }), handle(async (req, res, ps) => {
	res.json(await nooklog.importBookmarks(req.body, ps));
}));

app.delete('/api/bookmarks/:id', handle(async (req, res, ps) => {
	await nooklog.deleteById(ps.id);
	res.json({ success: true });
}));

app.get('/api/export/bookmarks', handle(async (req, res, ps) => {
	const date = new Intl.DateTimeFormat('sv-SE').format(new Date());
	if (ps.exportFormat === 'json') {
		res.setHeader('Content-Disposition', `attachment; filename="nooklog-bookmarks-${date}.json"`);
		res.json(await nooklog.exportObject(ps));
	} else if (ps.exportFormat === 'html') {
		res.setHeader('Content-Disposition', `attachment; filename="nooklog-bookmarks-${date}.html"`);
		res.type('text/html');
		res.send(await nooklog.exportHTML(ps));
	} else if (ps.exportFormat === 'markdown') {
		await sendZip(res, req, `nooklog-markdown-${date}.zip`,
			archive => nooklog.exportMarkdown(archive, ps));
	} else {
		res.status(400).json({ error: 'Format not supported yet' });
	}
}));

app.get('/api/alive', (req, res) => res.json({ alive: true }));

app.post('/api/markdown', handle(async (req, res, ps) => {
	const { html, title, ...rest } = ingester.html.process(ps.url, ps.title, ps.html);
	res.json(rest);
}));

app.get('/api/config', handle(async (req, res) => {
	res.json(nooklog.getConfig());
}));

app.post('/api/config', handle(async (req, res) => {
	nooklog.saveConfig(req.body);
	res.json({ success: true });
}));

app.listen(config['server.port'], async () => {
	logger.info({ url: `http://localhost:${config['server.port']}` }, 'server started');
});

const arraySchema = z.array(z.string())
	.or(z.string().transform(v => v.split(',').filter(Boolean)));
const paramsSchema = z.object({
	id: z.string(),
	url: z.string(),
	title: z.string(),
	memo: z.string(),
	html: z.string(),
	markdown: z.string(),
	rating: z.coerce.number(),
	tags: arraySchema,
	query: z.string(),
	fields: arraySchema,
	sortBy: z.string(),
	limit: z.coerce.number(),
	recentThresholdDays: z.coerce.number(),
	columns: arraySchema,
	folderTag: z.preprocess(v => v === 'true' || v === true, z.boolean()),
	exportFormat: z.string(),
	exportMeta: z.string(),
	exportStructure: z.string(),
}).partial();

async function sendZip(res, req, filename, task) {
	res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
	res.type('application/zip');
	res.setTimeout(0);

	const archive = archiver('zip', {
		zlib: { level: 6 },
		forceZip64: true,
		forceLocalTime: true,
	});

	req.on('close', () => archive.abort());
	archive.pipe(res);

	await task(archive);

	if (!res.writableFinished)
		await new Promise(resolve => res.on('finish', resolve));
}

function handle(handler, errorMessage) {
	return async (req, res) => {
		// データベースの空の返り値などを許容する
		res._json = res.json;
		res.json = body => res._json.call(res, body === undefined ? null : body);

		const body = (req.body && typeof req.body === 'object') ? req.body : {};
		const ps = paramsSchema.parse({ ...req.query, ...body, ...req.params });
		try {
			await handler(req, res, ps);
		} catch (error) {
			logger.error({ error, method: req.method, url: req.url }, errorMessage || 'request failed');
			res.status(500).json({ error: error.message });
		}
	};
}
