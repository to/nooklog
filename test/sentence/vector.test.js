import { test } from 'node:test';
import assert from 'node:assert';
import sentence from '../../server/core/sentence/index.js';

test('Sentence Vector (Embedding) Verification', async t => {
	await sentence.initialize();

	const query = 'LLMの仕組みを知りたい';
	const docs = [
		'大規模言語モデルはトランスフォーマーに基づいています。',
		'アテンション機構が重要です。',
	];

	await t.test('embedQuery should return a vector', async () => {
		const vec = await sentence.embedQuery(query);

		assert.ok(Array.isArray(vec));
		assert.strictEqual(typeof vec[0], 'number');
	});

	await t.test('embedDocument should return an array of vectors', async () => {
		const vecs = await sentence.embedDocument(docs);

		assert.ok(Array.isArray(vecs));
		assert.strictEqual(vecs.length, 2);
		assert.ok(Array.isArray(vecs[0]));
		assert.strictEqual(vecs[0].length, 768);
	});

});
