import 'dotenv/config';
import _ from './lib/util.js';
import express from 'express';

import path from 'path';
import { fileURLToPath } from 'url';

import config from './lib/config.js';
import nookmark from './lib/nookmark.js';
import baseLogger from './lib/logger.js';

const logger = baseLogger.child({ module: 'server' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use((req, res, next) => {
	logger.trace({ method: req.method, url: req.url }, 'request received');
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public'), {
	setHeaders: (res, path) => {
		if (path.endsWith('.woff2'))
			res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
	},
}));

// 予期せぬエラーを捕捉し、プロセスの停止を防ぐ
process.on('unhandledRejection', (reason, promise) => {
	logger.error({ error: reason, promise }, 'unhandled rejection');
});

app.get('/api/alive', (req, res) => res.json({ alive: true }));

app.get('/api/bookmarks/:id', handle(async (req, res, ps) => {
	res.json(await nookmark.findById(ps.id));
}));

app.post('/api/bookmarks/:id?', handle(async (req, res, ps) => {
	// 新規作成の場合はURLが必須
	if (!ps.id && !ps.url)
		return res.status(400).json({ error: 'Missing id or url' });

	const result = await nookmark.upsert(ps);
	res.json({
		id: result.bookmark.id,
	});
}));

app.get('/api/bookmarks', handle(async (req, res, ps) => {
	res.json(ps.url ?
		await nookmark.findByUrl(ps.url) :
		await nookmark.getRecent(ps));
}));

app.get('/api/search', handle(async (req, res, ps) => {
	res.json(await nookmark.search(ps));
}));

app.get('/api/tags', handle(async (req, res, ps) => {
	res.json(await nookmark.getTags());
}));

app.get('/api/config', handle(async (req, res) => {
	res.json(nookmark.getConfig());
}));

app.post('/api/config', handle(async (req, res) => {
	nookmark.saveConfig(req.body);
	res.json({ success: true });
}));

app.delete('/api/bookmarks/:id', handle(async (req, res, ps) => {
	await nookmark.deleteById(ps.id);
	res.json({ success: true });
}));

app.listen(config['server.port'], async () => {
	await nookmark.initialize();
	logger.info({ url: `http://localhost:${config['server.port']}` }, 'server started');
});

function handle(handler, errorMessage) {
	return async (req, res) => {
		// データベースの空の返り値などを許容する
		res._json = res.json;
		res.json = body => res._json.call(res, body === undefined ? null : body);

		const ps = useParams({ ...req.query, ...req.body, ...req.params });
		try {
			await handler(req, res, ps);
		} catch (error) {
			logger.error({ error, method: req.method, url: req.url }, errorMessage || 'request failed');
			res.status(500).json({ error: error.message });
		}
	};
}

const PARAMS_SCHEMA = {
	id: '',
	url: '',
	title: '',
	memo: '',
	html: '',
	rating: 0,
	tags: [],
	query: '',
	fields: [],
	sortBy: '',
	limit: 0,
	columns: [],
};

function useParams(ps, schema = PARAMS_SCHEMA) {
	const res = {};
	for (const [key, type] of Object.entries(schema)) {
		const val = ps[key];
		if (val == null)
			continue;

		if (Array.isArray(type)) {
			res[key] =
				Array.isArray(val) ? val :
					val ? val.split(',') : [];
		} else if (typeof type === 'number') {
			res[key] = _.parseNumber(val);
		} else {
			res[key] = val;
		}
	}
	return res;
}
