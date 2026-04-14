import { test } from 'node:test';
import assert from 'node:assert';
import { batch } from '../../server/core/queue.js';

test('Core Queue - batch() function', async t => {
	await t.test('should process all items in chunks correctly', async () => {
		const list = Array.from({ length: 25 }, (_, i) => i);
		const result = [];
		const chunkSizes = [];

		await batch(list, async slice => {
			result.push(...slice);
			chunkSizes.push(slice.length);
		}, { size: 10, interval: 0 });

		// Should process all 25 items
		assert.strictEqual(result.length, 25);
		assert.deepStrictEqual(result, list);

		// Should be divided into [10, 10, 5]
		assert.deepStrictEqual(chunkSizes, [10, 10, 5]);
	});

	await t.test('should support abortion via promise.abort()', async () => {
		const list = Array.from({ length: 100 }, (_, i) => i);
		let processedCount = 0;

		const promise = batch(list, async slice => {
			processedCount += slice.length;
			// Artificial delay to make abortion easier to trigger between chunks
			await new Promise(resolve => setTimeout(resolve, 50));
		}, { size: 10, interval: 10 });

		// Trigger abort after the first chunk starts processing
		setTimeout(() => {
			promise.abort();
		}, 20);

		await promise;

		// Should have stopped before processing all items
		assert.ok(processedCount < 100, `Expected early exit, but processed ${processedCount} items`);
	});

	await t.test('should handle single item list', async () => {
		const list = ['only-one'];
		const result = [];
		await batch(list, async slice => {
			result.push(...slice);
		});
		assert.deepStrictEqual(result, ['only-one']);
	});

	await t.test('should handle empty list', async () => {
		const list = [];
		let called = false;
		await batch(list, async () => {
			called = true;
		});
		assert.strictEqual(called, false);
	});
});
