import { test } from 'node:test';
import assert from 'node:assert';
import { process } from '../../server/core/ingest/html.js';

test('ingest/html.js - process', async t => {

	await t.test('横方向テーブル (th td td) が Markdown のフォールバック形式に変換されること', () => {
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
		const title = 'Test Page';

		const result = process(url, title, html);

		assert.ok(result.markdown.includes('| | | |'), 'Should include dummy header with 3 columns');
		assert.ok(result.markdown.includes('|---|---|---|'), 'Should include dummy header separator with 3 columns');

		assert.ok(result.markdown.includes('| **Item** | Value 1 | Value 2 |'), 'First row should be converted correctly');
		assert.ok(result.markdown.includes('| **Name** | John | Jane |'), 'Second row should be converted correctly');
	});

	await t.test('通常のテーブル (1行目がすべて th) はデフォルトの挙動になること', () => {
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
		const result = process('https://example.com', 'Standard Table', html);

		// 通常のテーブル（GFM）はダミーヘッダを挿入しないはず
		assert.strictEqual(result.markdown.includes('| | |'), false, '通常テーブルにダミーヘッダが含まれないこと');
		assert.ok(result.markdown.includes('| Header 1 | Header 2 |'), 'ヘッダが正しく出力されていること');
	});
});
