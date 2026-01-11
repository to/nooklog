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
});
