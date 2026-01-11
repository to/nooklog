import express from 'express';
import cors from 'cors';
import { initialize, saveHtmlToLibrary, getRecentPages } from './nookmark.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.post('/api/save', async (req, res) => {
	try {
		const { url, title, html } = req.body;

		if (!url || !html)
			return res.status(400).json({ error: 'Missing url or html' });

		console.log(`Received save request: ${title} (${url})`);

		const result = await saveHtmlToLibrary(url, title, html);

		if (result.isDuplicate) {
			console.log(`Duplicate found: ${result.id}`);
			return res.json({ id: result.id, status: 'found_existing' });
		}

		console.log(`Saved new record: ${result.id}`);
		res.json({ id: result.id, status: 'draft_created' });

	} catch (error) {
		console.error('Error in /api/save:', error);
		res.status(500).json({ error: error.message });
	}
});

app.get('/api/pages', async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 20;
		const results = await getRecentPages(limit);
		res.json(results);
	} catch (error) {
		console.error('Error in /api/pages:', error);
		res.status(500).json({ error: error.message });
	}
});

app.listen(PORT, async () => {
	await initialize();
	console.log(`Server running on http://localhost:${PORT}`);
});
