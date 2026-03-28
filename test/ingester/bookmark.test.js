import { test } from 'node:test';
import assert from 'node:assert';
import { process } from '../../server/core/ingest/bookmark.js';

test('ingest/bookmark.js - process', async t => {

	await t.test('基本的なブックマークが正しくパースされること（日付は数値タイムスタンプ）', () => {
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><A HREF="https://example.com" ADD_DATE="1726056000" LAST_MODIFIED="1726057000">Example Site</A>
			</DL>
		`;
		const results = process(html);

		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].url, 'https://example.com');
		assert.strictEqual(results[0].title, 'Example Site');
		assert.strictEqual(results[0].created_at, 1726056000 * 1000);
		assert.strictEqual(results[0].updated_at, 1726057000 * 1000, 'LAST_MODIFIED が優先されていること');
	});

	await t.test('タグの正規化（小文字化、記号のハイフン置換）が行われること', () => {
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><A HREF="https://example.com" TAGS="JavaScript, Web Dev, Productivity & Tools">Site</A>
			</DL>
		`;
		const results = process(html);

		// Productivity & Tools -> productivity-tools
		assert.deepStrictEqual(results[0].tags, ['javascript', 'web-dev', 'productivity-tools']);
	});

	await t.test('ディレクトリ名をタグにするオプションが機能すること', () => {
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><H3>Top Folder</H3>
				<DL><p>
					<DT><H3>Sub Folder</H3>
					<DL><p>
						<DT><A HREF="https://example.com">Nested Site</A>
					</DL><p>
				</DL><p>
			</DL>
		`;

		// オプションあり
		const resultsWithTags = process(html, { folderTag: true });
		// 親フォルダが tags に含まれる（順序は実装依存だが、ここでは Sub Folder, Top Folder の順で入るはず）
		assert.ok(resultsWithTags[0].tags.includes('sub-folder'));
		assert.ok(resultsWithTags[0].tags.includes('top-folder'));

		// オプションなし
		const resultsWithoutTags = process(html, { folderTag: false });
		assert.strictEqual(resultsWithoutTags[0].tags.length, 0);
	});

	await t.test('Firefox形式のTAGSとディレクトリタグが共存し、重複排除されること', () => {
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><H3>Development</H3>
				<DL><p>
					<DT><A HREF="https://github.com" TAGS="dev,git">GitHub</A>
					<DT><A HREF="https://react.dev" TAGS="dev,React">React</A>
				</DL>
			</DL>
		`;
		const results = process(html, { folderTag: true });

		const github = results.find(r => r.title === 'GitHub');
		assert.deepStrictEqual(github.tags.sort(), ['dev', 'development', 'git']);

		const react = results.find(r => r.title === 'React');
		// React -> react (小文字化), Development -> development
		assert.deepStrictEqual(react.tags.sort(), ['dev', 'development', 'react']);
	});

});
