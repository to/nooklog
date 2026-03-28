import { test } from 'node:test';
import assert from 'node:assert/strict';
import sentence from '../../server/core/sentence/index.js';

test('sentence.split() - Basic sentence splitting', () => {
	const text = 'こんにちは。！！？。お元気ですか？はい、元気です。';
	const chunks = sentence.split(text);

	assert.strictEqual(chunks.length, 3);
	assert.strictEqual(chunks[0].text, 'こんにちは。');
	assert.strictEqual(chunks[2].text, 'はい、元気です。');
});

test('sentence.split() - Newline splitting', () => {
	const text = '一行目\n二行目\n三行目';
	const chunks = sentence.split(text);

	assert.strictEqual(chunks.length, 3);
	assert.strictEqual(chunks[0].text, '一行目\n');
	assert.strictEqual(chunks[1].text, '二行目\n');
});

test('sentence.split() - English punctuation with spaces', () => {
	const text = 'Hello world. v1.0 is out! Is it good? Yes.';
	const chunks = sentence.split(text);

	// "v1.0" は分割させない。 ". " (スペースあり) で分割する。
	assert.strictEqual(chunks.length, 4);
	assert.ok(chunks[0].text.includes('Hello world.'));
	assert.ok(chunks[1].text.includes('v1.0 is out!'));
	assert.ok(chunks[2].text.includes('Is it good?'));
	assert.ok(chunks[3].text.includes('Yes.'));

	const v10Chunks = sentence.split('v1.0 is out');
	assert.strictEqual(v10Chunks.length, 1, 'v1.0 must not be split');
});
