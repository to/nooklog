import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nookmark from './nookmark.js';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Pinboard Token:', process.env.PINBOARD_TOKEN ? 'Loaded' : 'Missing');

app.use(cors());
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

app.post('/api/save', handle(async (req, res) => {
	const { url, title, html } = req.body;

	if (!url || !html)
		return res.status(400).json({ error: 'Missing url or html' });

	console.log(`Received save request: ${title} (${url})`);

	const result = await nookmark.upsertPage({ url, title, html });
	res.json({
		success: true,
		id: result.id,
	});
}, 'Error: /api/save'));

app.get('/api/bookmark/:id', handle(async (req, res) => {
	const { id } = req.params;
	const page = await nookmark.findPageById(id);
	if (!page)
		return res.status(404).json({ error: 'Bookmark not found' });

	res.json(page);
}, 'Error: GET /api/bookmark/:id'));

app.post('/api/bookmark/:id', handle(async (req, res) => {
	const { id } = req.params;
	const { title, memo, tags } = req.body;

	console.log(`Updating bookmark: ${id}`);

	// TODO: URLも保存対象に(変更広範囲)
	const result = await nookmark.upsertPage({ id, title, memo, tags });
	res.json({
		success: true,
		id: result.id,
		page: result.page,
	});
}, 'Error: POST /api/bookmark/:id'));

app.get('/api/pages', handle(async (req, res) => {
	const limit = parseInt(req.query.limit) || 20;
	const results = await nookmark.getRecentPages(limit);
	res.json(results);
}, 'Error in /api/pages'));

app.listen(PORT, async () => {
	await nookmark.initialize();
	console.log(`Server running on http://localhost:${PORT}`);
});
