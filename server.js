import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nookmark from './nookmark.js';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Pinboard Token:', process.env.PINBOARD_TOKEN ? 'Loaded' : 'Missing');

// Private Network Access (PNA) 対応
// HTTPSのサイト(HuggingFaceなど)からlocalhostへのアクセスを許可するために必要
// 注意: cors()ミドルウェアより【前】に書かないと、プリフライト(OPTIONS)リクエストでヘッダーが付与されずブロックされる
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

app.get('/api/bookmarks/:id', handle(async (req, res) => {
	const { id } = req.params;
	const page = await nookmark.findPageById(id);
	if (!page)
		return res.status(404).json({ error: 'Bookmark not found' });

	res.json(page);
}, 'Error: GET /api/bookmarks/:id'));

app.post('/api/bookmarks/:id?', handle(async (req, res) => {
	const { id } = req.params;
	const { url, title, memo, rating, tags, html } = req.body;

	// 新規作成の場合はURLが必須
	if (!id && !url)
		return res.status(400).json({ error: 'Missing id or url' });

	console.log(
		`${id ? 'Update' : 'Save'}: ${title}\nURL: ${url}${id ? '\nID: ' + id : ''}`);

	const result = await nookmark.upsertPage({ id, url, title, memo, rating, tags, html });
	res.json({
		id: result.page.id,
	});
}, 'Error: POST /api/bookmarks/:id?'));

app.get('/api/bookmarks', handle(async (req, res) => {
	const limit = parseInt(req.query.limit) || 20;
	const results = await nookmark.getRecentPages(limit);
	res.json(results);
}, 'Error: GET /api/bookmarks'));

app.get('/api/search', handle(async (req, res) => {
	const { tags, query, fields, minRating, sortBy, limit } = req.query;
	const results = await nookmark.searchPages({
		tags: tags ? tags.split(',') : [],
		query: query || '',
		fields: fields ? fields.split(',') : [],
		minRating: minRating ? parseInt(minRating) : undefined,
		sortBy: sortBy || 'updated_at',
		limit: limit ? parseInt(limit) : 200,
	});
	res.json(results);
}, 'Error: GET /api/search'));

app.delete('/api/bookmarks/:id', handle(async (req, res) => {
	const { id } = req.params;
	await nookmark.deletePageById(id);
	res.json({ success: true });
}, 'Error: DELETE /api/bookmarks/:id'));

app.listen(PORT, async () => {
	await nookmark.initialize();
	console.log(`Server running on http://localhost:${PORT}`);
});
