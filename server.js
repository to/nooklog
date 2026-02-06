import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nookmark from './nookmark.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
	minRating: 0,
	sortBy: '',
	limit: 0,
};

console.log('Pinboard Token:', process.env.PINBOARD_TOKEN ? 'Loaded' : 'Missing');

// Private Network Access (PNA) 対応
// HTTPSのサイト(HuggingFaceなど)からlocalhostへのアクセスを許可するために必要
// cors()ミドルウェアより前に書かないと、プリフライト(OPTIONS)リクエストでヘッダーが付与されずブロックされる
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	next();
});
app.use(cors({
	origin: true, // リクエスト元のオリジンを許可（ユーザースクリプトから動くように）
	credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 予期せぬエラーを捕捉し、プロセスの停止を防ぐ
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const handle = (handler, errorContext) => async (req, res) => {
	try {
		await handler(req, res);
	} catch (error) {
		console.error(`${errorContext}:`, error);
		res.status(500).json({ error: error.message });
	}
};

const useParams = (params, schema = PARAMS_SCHEMA) => {
	const res = {};
	for (const [key, type] of Object.entries(schema)) {
		const val = params[key];
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
};

app.get('/api/bookmarks/:id', handle(async (req, res) => {
	const bm = await nookmark.findById(req.params.id);
	if (!bm)
		return res.status(404).json({ error: 'Bookmark not found' });

	res.json(bm);
}, 'Error: GET /api/bookmarks/:id'));

app.post('/api/bookmarks/:id?', handle(async (req, res) => {
	const bm = Object.assign(
		useParams(req.params),
		useParams(req.body));

	// 新規作成の場合はURLが必須
	if (!bm.id && !bm.url)
		return res.status(400).json({ error: 'Missing id or url' });

	console.log(
		`${bm.id ? 'Update' : 'Save'}: ${bm.title}\nURL: ${bm.url}${bm.id ? '\nID: ' + bm.id : ''}`);

	const result = await nookmark.upsert(bm);
	res.json({
		id: result.bookmark.id,
	});
}, 'Error: POST /api/bookmarks/:id?'));

app.get('/api/bookmarks', handle(async (req, res) => {
	const params = useParams(req.query);
	return params.url ?
		res.json(await nookmark.findByUrl(params.url)) :
		res.json(await nookmark.getRecent(params.limit));
}, 'Error: GET /api/bookmarks'));

app.get('/api/dump', handle(async (req, res) => {
	res.json(await nookmark.getDump(
		useParams(req.query).limit));
}, 'Error: GET /api/dump'));

app.get('/api/search', handle(async (req, res) => {
	res.json(await nookmark.search(
		useParams(req.query)));
}, 'Error: GET /api/search'));

app.delete('/api/bookmarks/:id', handle(async (req, res) => {
	await nookmark.deleteById(req.params.id);
	res.json({ success: true });
}, 'Error: DELETE /api/bookmarks/:id'));

app.listen(PORT, async () => {
	await nookmark.initialize();
	console.log(`Server running on http://localhost:${PORT}`);
});
