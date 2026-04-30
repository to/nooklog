import { test } from 'node:test';
import assert from 'node:assert';

import { env } from '../server/core/config.js';
import db from '../server/core/database.js';
import nooklog from '../server/core/nooklog.js';
import sentence from '../server/core/sentence/index.js';
import { wait } from '../server/core/util.js';

const USER_MARK = '\u200B';

test('nooklog.js functional verification', async t => {
	env['database.turso.url'] = ':memory:';
	env['database.turso.token'] = 'dummy';

	await db.initialize();
	await nooklog.initialize();

	await t.test('Markdown should not be overwritten if USER_MARK is present', async () => {
		const url = 'https://example.com';
		const editedContent = 'User edited content' + USER_MARK;

		// Initial save (ID will be generated)
		const firstResult = await nooklog.save({ url, title: 'dummy', markdown: editedContent });
		const id = firstResult.id;

		// Automatic update (try to overwrite using the same ID)
		const result = await nooklog.save({ id, url, title: 'dummy', markdown: 'Fresh automatic content' });

		assert.strictEqual(result.markdown, editedContent, 'User edited content must be preserved');
	});

	await t.test('Markdown should be overwritten if input has USER_MARK', async () => {
		const id = 'test-id';
		const url = 'https://example.com';
		const newEdit = 'New manual edit' + USER_MARK;

		const result = await nooklog.save({ id, url, title: 'dummy', markdown: newEdit });

		assert.strictEqual(result.markdown, newEdit, 'New manual edit must overwrite existing content');
	});

	await t.test('Existing ID should be preserved even if input has empty ID', async () => {
		const url = 'https://id-preservation-test.com';

		// 1. Initial save to generate an ID
		// Provide title and markdown to skip crawler
		const firstResult = await nooklog.save({ url, title: 'Original', markdown: 'dummy' });
		const originalId = firstResult.id;
		assert.ok(originalId, 'ID should be generated');

		// 2. Update by URL, but explicitly pass an empty string as ID
		const updateResult = await nooklog.save({ id: '', url, title: 'Updated', markdown: 'dummy' });

		// 3. Verify ID is still the original one
		assert.strictEqual(updateResult.id, originalId, 'Existing ID must not be overwritten by empty string');

		// 4. Also verify it's still found in the database by the original ID
		const found = await nooklog.find({ id: originalId });
		assert.ok(found, 'Should still find the bookmark by its original ID');
		assert.strictEqual(found.title, 'Updated', 'Title should have been updated');
	});

	await t.test('Secret masking and configuration persistence', async t => {
		const SECRET_MASK = '********';
		const { default: configProxy } = await import('../server/core/config.js');
		const crypto = await import('node:crypto');

		await t.test('server.password should be hashed and masked', async () => {
			const password = 'my-secret-password';

			// Save new password
			await nooklog.saveConfig({ 'server.password': password });

			// Verify salted hash
			const stored = configProxy['server.password'];
			const [salt, storedHash] = stored.split(':');
			const expectedHash = crypto.createHash('sha256').update(password + salt).digest('hex');

			assert.ok(salt && salt.length === 32, 'Salt should be 32 characters hex');
			assert.strictEqual(storedHash, expectedHash, 'Password must be hashed with salt in internal config');

			// Check masking in result of getConfig
			const masked = nooklog.getConfig();
			assert.strictEqual(masked['server.password'], SECRET_MASK, 'Password must be masked in getConfig output');

			// Send back the mask - it should NOT overwrite the real password
			await nooklog.saveConfig({ 'server.password': SECRET_MASK, 'client.theme': 'dark' });
			assert.strictEqual(configProxy['server.password'], stored, 'Real password must be preserved when SECRET_MASK is sent');
			assert.strictEqual(configProxy['client.theme'], 'dark', 'Other values should still be updated');
		});

		await t.test('sentence.vector.apiKey should be masked', async () => {
			const apiKey = 'sk-1234567890';

			// Save new API Key
			await nooklog.saveConfig({ 'sentence.vector.apiKey': apiKey });
			assert.strictEqual(configProxy['sentence.vector.apiKey'], apiKey, 'API Key must be saved exactly as is internally');

			// Check masking
			const masked = nooklog.getConfig();
			assert.strictEqual(masked['sentence.vector.apiKey'], SECRET_MASK, 'API Key must be masked in getConfig output');

			// Send back the mask - it should NOT overwrite
			await nooklog.saveConfig({ 'sentence.vector.apiKey': SECRET_MASK });
			assert.strictEqual(configProxy['sentence.vector.apiKey'], apiKey, 'Real API key must be preserved when SECRET_MASK is sent');
		});
	});

	await t.test('Bookmark import (Netscape HTML format)', async () => {
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><H3>Project A</H3>
				<DL><p>
					<DT><A HREF="https://a.example.com" TAGS="work,important">Site A</A>
				</DL><p>
				<DT><H3>Project B</H3>
				<DL><p>
					<DT><A HREF="https://b.example.com">Site B</A>
				</DL><p>
			</DL>
		`;

		// Import with folderTag option
		const importResult = await nooklog.import(html, { folderTag: true });
		assert.strictEqual(importResult.count, 2, 'Should import 2 bookmarks');

		// Verify Site A (should have tags: work, important, project-a)
		const searchA = await nooklog.search({ query: 'Site A' });
		const siteA = searchA.bookmarks[0];
		assert.ok(siteA.tags.includes('work'));
		assert.ok(siteA.tags.includes('important'));
		assert.ok(siteA.tags.includes('project-a'));

		// Verify Site B (should have tags: project-b)
		const searchB = await nooklog.search({ query: 'Site B' });
		const siteB = searchB.bookmarks[0];
		assert.ok(siteB.tags.includes('project-b'));
	});

	await t.test('Selective vector updates (pinpoint embedding)', async () => {
		// Enable vector search and mock the embedding backend
		env['sentence.vector.enabled'] = true;

		const originalRequest = sentence._request;
		// Mock embedding to return a fixed vector
		sentence._request = async input => (Array.isArray(input) ? input : [input]).map(() => new Array(768).fill(0));

		try {
			await db.initializeVectorTable();

			const b = await nooklog.save({
				url: 'https://test.com',
				title: 'Original Title',
				memo: 'Original Memo',
				markdown: 'dummy',
			});

			await wait(50);

			// Helper to get vector info from DB
			const getVectors = async id => (await db.client.execute({
				sql: 'SELECT row_id, field FROM bookmark_vector WHERE bookmark_id = (SELECT row_id FROM bookmark WHERE id = ?)',
				args: [id],
			})).rows;

			const v1 = await getVectors(b.id);
			assert.strictEqual(v1.length, 3, 'Initial save should create 3 vectors (title, memo, markdown)');
			
			const titleVector = v1.find(v => v.field === 'title');
			const memoVector = v1.find(v => v.field === 'memo');

			assert.ok(titleVector, 'Title vector should exist in V1');
			assert.ok(memoVector, 'Memo vector should exist in V1');

			const titleVectorRowId = titleVector.row_id;
			const memoVectorRowId = memoVector.row_id;

			// Update ONLY memo
			await nooklog.save({ id: b.id, memo: 'Updated Memo' });

			await wait(50);

			const v2 = await getVectors(b.id);
			const newTitleVector = v2.find(v => v.field === 'title');
			const newMemoVector = v2.find(v => v.field === 'memo');

			assert.ok(newTitleVector, 'Title vector MUST exist in V2');
			assert.strictEqual(newTitleVector.row_id, titleVectorRowId, 'Title vector MUST be preserved (row_id same)');
			assert.notStrictEqual(newMemoVector.row_id, memoVectorRowId, 'Memo vector MUST be re-created (row_id changed)');

			// Update ONLY tags (should NOT trigger any re-embedding)
			const memoRowIdBeforeTags = newMemoVector.row_id;
			await nooklog.save({ id: b.id, tags: ['new-tag'] });

			const v3 = await getVectors(b.id);
			assert.strictEqual(v3.find(v => v.field === 'memo').row_id, memoRowIdBeforeTags, 'Tags update must NOT trigger re-embedding');

		} finally {
			sentence._request = originalRequest;
			env['sentence.vector.enabled'] = false;
		}
	});
});
