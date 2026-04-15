import { test } from 'node:test';
import assert from 'node:assert';
import { env } from '../server/core/config.js';

const USER_MARK = '\u200B';

test('nooklog.js functional verification', async t => {
	env['database.turso.url'] = ':memory:';
	env['database.turso.token'] = 'dummy';

	const { default: nooklog } = await import('../server/core/nooklog.js');
	await nooklog.initialize();

	await t.test('Markdown should not be overwritten if USER_MARK is present', async () => {
		const url = 'https://example.com';
		const editedContent = 'User edited content' + USER_MARK;

		// Initial save (ID will be generated)
		const firstResult = await nooklog.save({ url, markdown: editedContent });
		const id = firstResult.id;

		// Automatic update (try to overwrite using the same ID)
		const result = await nooklog.save({ id, url, markdown: 'Fresh automatic content' });

		assert.strictEqual(result.markdown, editedContent, 'User edited content must be preserved');
	});

	await t.test('Markdown should be overwritten if input has USER_MARK', async () => {
		const id = 'test-id';
		const url = 'https://example.com';
		const newEdit = 'New manual edit' + USER_MARK;

		const result = await nooklog.save({ id, url, markdown: newEdit });

		assert.strictEqual(result.markdown, newEdit, 'New manual edit must overwrite existing content');
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
});
