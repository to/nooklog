import { test } from 'node:test';
import assert from 'node:assert';
import { process } from '../../server/core/ingest/html.js';

test('ingest/html.js - process', async t => {

	await t.test('Horizontal table (th td td) should be converted to fallback Markdown format', () => {
		const html = `
			<!DOCTYPE html>
			<html>
			<body>
				<h1>Test Table</h1>
				<table>
					<tr>
						<th>Item</th>
						<td>Value 1</td>
						<td>Value 2</td>
					</tr>
					<tr>
						<th>Name</th>
						<td>John</td>
						<td>Jane</td>
					</tr>
				</table>
			</body>
			</html>
		`;
		const url = 'https://example.com/test';

		const result = process(url, html);

		assert.ok(result.markdown.includes('| | | |'), 'Should include dummy header with 3 columns');
		assert.ok(result.markdown.includes('|---|---|---|'), 'Should include dummy header separator with 3 columns');

		assert.ok(result.markdown.includes('| **Item** | Value 1 | Value 2 |'), 'First row should be converted correctly');
		assert.ok(result.markdown.includes('| **Name** | John | Jane |'), 'Second row should be converted correctly');
	});

	await t.test('Standard table (first row all th) should use default GFM behavior', () => {
		const html = `
			<!DOCTYPE html>
			<html>
			<body>
				<table>
					<thead>
						<tr><th>Header 1</th><th>Header 2</th></tr>
					</thead>
					<tbody>
						<tr><td>Data 1</td><td>Data 2</td></tr>
					</tbody>
				</table>
			</body>
			</html>
		`;
		const result = process('https://example.com', html);

		// Standard tables (GFM) should not have dummy headers inserted
		assert.strictEqual(result.markdown.includes('| | |'), false, 'Standard table should not include dummy header');
		assert.ok(result.markdown.includes('| Header 1 | Header 2 |'), 'Headers should be output correctly');
	});
	await t.test('Wayback Machine <base> tag should set archiveUrl and resolve relative links', () => {
		const archiveBase = 'https://web.archive.org/web/20241130163753/https://techable.jp/archives/95388';
		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<base href="${archiveBase}">
			</head>
			<body>
				<a href="relative-page">Link</a>
				<img src="img/test.jpg">
			</body>
			</html>
		`;
		const url = 'https://techable.jp/archives/95388';
		const result = process(url, html);

		// Assert archiveUrl is extracted into YAML frontmatter
		assert.ok(result.markdown.includes(`archive: "${archiveBase}"`), 'Should include archive URL in YAML');

		// Assert relative links are resolved using the base URL
		assert.ok(result.markdown.includes('(https://web.archive.org/web/20241130163753/https://techable.jp/archives/relative-page)'), 'Relative link should be resolved using archive base');

		// Assert the base tag is preserved in result.html (due to our capture-before-cleaning fix)
		assert.ok(result.html.includes(`<base href="${archiveBase}">`), 'Original base tag should be preserved in result.html');
	});

	await t.test('Malformed HTML should fall back to URL-only Markdown', () => {
		const html = '   '; // Empty/whitespace only
		const url = 'https://example.com/failed';
		const result = process(url, html);

		assert.ok(result.markdown.includes('url: "https://example.com/failed"'), 'Should still include URL in YAML');
		assert.strictEqual(result.markdown.includes('title:'), false, 'Should not include title');
		assert.strictEqual(result.markdown.includes('archive:'), false, 'Should not include archive');
		assert.strictEqual(result.html, html, 'Should return original HTML as is');
	});

	await t.test('Page with only script tag should process gracefully without TypeError', () => {
		const html = '<script>sessionStorage.x5referer = window.location.href;</script>';
		const url = 'https://example.com/test';
		const result = process(url, html);

		assert.ok(result.markdown.includes('url: "https://example.com/test"'));
		assert.strictEqual(result.markdown.includes('title:'), false);
	});
});
