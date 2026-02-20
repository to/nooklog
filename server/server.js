import 'dotenv/config';
import express from 'express';

import path from 'path';
import { fileURLToPath } from 'url';

import config from './lib/config.js';
import nookmark from './lib/nookmark.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// 予期せぬエラーを捕捉し、プロセスの停止を防ぐ
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.get('/api/bookmarks/:id', handle(async (req, res, ps) => {
	res.json(await nookmark.findById(ps.id));
}, 'Error: GET /api/bookmarks/:id'));

app.post('/api/bookmarks/:id?', handle(async (req, res, ps) => {
	// 新規作成の場合はURLが必須
	if (!ps.id && !ps.url)
		return res.status(400).json({ error: 'Missing id or url' });

	const result = await nookmark.upsert(ps);
	res.json({
		id: result.bookmark.id,
	});
}, 'Error: POST /api/bookmarks/:id?'));

app.get('/api/bookmarks', handle(async (req, res, ps) => {
	res.json(ps.url ?
		await nookmark.findByUrl(ps.url) :
		await nookmark.getRecent(ps));
}, 'Error: GET /api/bookmarks'));

app.get('/api/dump', handle(async (req, res, ps) => {
	res.json(await nookmark.getDump(ps.limit));
}, 'Error: GET /api/dump'));

app.get('/api/search', handle(async (req, res, ps) => {
	res.json(await nookmark.search(ps));
}, 'Error: GET /api/search'));

app.get('/api/tags', handle(async (req, res, ps) => {
	res.json(await nookmark.getTags());
}, 'Error: GET /api/tags'));

app.delete('/api/bookmarks/:id', handle(async (req, res, ps) => {
	await nookmark.deleteById(ps.id);
	res.json({ success: true });
}, 'Error: DELETE /api/bookmarks/:id'));

app.listen(config.server.port, async () => {
	await nookmark.initialize();
	console.log(`Server running on http://localhost:${config.server.port}`);
});

function handle(handler, errorContext) {
	return async (req, res) => {
		// データベースの空の返り値などを許容する
		res._json = res.json;
		res.json = body => res._json.call(res, body === undefined ? null : body);

		const ps = useParams({ ...req.query, ...req.body, ...req.params });
		try {
			await handler(req, res, ps);
		} catch (error) {
			console.error(`${errorContext}:`, error);
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
			res[key] = parseInt(val) || undefined;
		} else {
			res[key] = val;
		}
	}
	return res;
}
