import crypto from 'crypto';
import { processHtml } from './lib/librarian.js';
import {
	initialize as dbInitialize,
	findPageByUrl,
	savePage,
	getRecentPages as dbGetRecentPages,
} from './lib/database.js';

export async function initialize() {
	await dbInitialize();
}

export async function saveHtmlToLibrary(url, title, html) {
	const existing = await findPageByUrl(url);

	if (existing) {
		return {
			success: true,
			id: existing.id,
			isDuplicate: true,
		};
	}

	const page = processHtml(url, title, html);
	const newId = crypto.randomUUID();
	const now = Date.now();
	const newRecord = {
		id: newId,
		url: url,
		title: page.title,
		memo: '',
		rating: 3,
		ai_keywords: [],
		keywords: [],
		tags: [],
		content: page.content,
		created_at: now,
		updated_at: now,
	};

	await savePage(newRecord);

	return {
		success: true,
		id: newId,
		isDuplicate: false,
	};
}

export async function getRecentPages(limit = 20) {
	return await dbGetRecentPages(limit);
}
