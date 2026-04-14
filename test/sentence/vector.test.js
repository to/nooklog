import { test } from 'node:test';
import assert from 'node:assert';
import { env } from '../../server/core/config.js';
import sentence from '../../server/core/sentence/index.js';

test('Sentence Vector (Embedding) Verification', async t => {
	env['sentence.vector.enabled'] = true;
	env['sentence.vector.url'] = 'http://localhost:11434/v1/embeddings';

	// 1. Connection Check & Model Selection
	// This also verifies if the Ollama server is running.
	const models = await sentence.getModels();
	if (models.length === 0) {
		t.diagnostic('[ENV CHECK] Could not connect to the embedding service or no models found.');
		t.diagnostic('Please make sure Ollama is running at http://localhost:11434');
		t.skip('Embedding service not reachable. Skipping tests.');
		return;
	}

	const bestModel = models.sort((a, b) => {
		const aE = /embed/i.test(a);
		const bE = /embed/i.test(b);
		if (aE !== bE)
			return bE - aE;
		return a.localeCompare(b);
	})[0];

	env['sentence.vector.model'] = bestModel;
	t.diagnostic(`[INFO] Selected best model: ${bestModel}`);

	// 2. Functional Pre-flight check
	// Verify that the selected model can actually produce vectors.
	try {
		await sentence.getDimension();
	} catch (err) {
		t.diagnostic(`[ENV CHECK] Functional check failed for model "${bestModel}": ${err.message}`);
		t.diagnostic(`Try running: ollama pull ${bestModel}`);
		t.skip('Model initialization failed. Skipping remaining tests.');
		return;
	}

	const query = 'How do LLMs work?';
	const docs = [
		'Large Language Models are based on the Transformer architecture.',
		'The attention mechanism is a key component.',
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
		assert.strictEqual(vecs[0].length, await sentence.getDimension());
	});
});
