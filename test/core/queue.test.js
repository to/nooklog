import { test } from 'node:test';
import assert from 'node:assert';
import { batch, task, clear } from '../../server/core/queue.js';

test('Core Queue', async t => {
	// Ensure a clean state for every test
	t.beforeEach(async () => {
		await clear();
	});

	await t.test('batch() - process all items in chunks correctly', async () => {
		const list = Array.from({ length: 25 }, (_, i) => i);
		const result = [];
		const chunkSizes = [];

		await batch('TestChunks', async slice => {
			result.push(...slice);
			chunkSizes.push(slice.length);
		}, list, { size: 10, interval: 0 });

		assert.strictEqual(result.length, 25);
		assert.deepStrictEqual(result, list);
		assert.deepStrictEqual(chunkSizes, [10, 10, 5]);
	});

	await t.test('batch() - support numeric items (numeric mode)', async () => {
		let totalProcessed = 0;
		const steps = [];

		await batch('Numeric', async count => {
			totalProcessed += count;
			steps.push(count);
		}, 120, { size: 50, interval: 0 });

		assert.strictEqual(totalProcessed, 120);
		assert.deepStrictEqual(steps, [50, 50, 20]);
	});

	await t.test('task() - run a single task', async () => {
		let called = 0;
		await task('Single', async count => {
			called++;
			assert.strictEqual(count, 1);
		});
		assert.strictEqual(called, 1);
	});

	await t.test('mode: "queue" (default) - serialize same-label jobs', async () => {
		const result = [];
		const b1 = batch('Serialize', async slice => {
			result.push('A' + slice[0]);
			await new Promise(r => setTimeout(r, 10));
		}, [1, 2], { size: 1, interval: 0 });

		const b2 = batch('Serialize', async slice => {
			result.push('B' + slice[0]);
		}, [1, 2], { size: 1, interval: 0 });

		await Promise.all([b1, b2]);
		assert.deepStrictEqual(result, ['A1', 'A2', 'B1', 'B2']);
	});

	await t.test('mode: "replace" - abort previous job with same label', async () => {
		const result = [];
		let aborted = false;

		const b1 = batch('Replace', async (slice, i, signal) => {
			try {
				result.push('A' + slice[0]);
				await new Promise((resolve, reject) => {
					if (signal.aborted)
						return reject(new Error('AbortError'));
					const timer = setTimeout(resolve, 1000);
					signal.addEventListener('abort', () => {
						clearTimeout(timer);
						reject(new Error('AbortError'));
					}, { once: true });
				});
				result.push('A' + slice[0] + '-done');
			} catch (e) {
				if (e.message === 'AbortError' || e.name === 'AbortError')
					aborted = true;
				throw e;
			}
		}, [1, 2], { size: 1, mode: 'replace' });

		await new Promise(r => setTimeout(r, 50));

		const b2 = batch('Replace', async slice => {
			result.push('B' + slice[0]);
		}, [1], { size: 1, mode: 'replace' });

		await Promise.allSettled([b1, b2]);

		assert.ok(aborted, 'First job should have been aborted');
		assert.ok(!result.includes('A1-done'), 'First job should not have finished its work');
		assert.ok(result.includes('B1'), 'Second job should have executed');
	});

	await t.test('clear() - stop all running jobs', async () => {
		let aStarted = false;
		let aStopped = false;

		const b1 = batch('JobA', async (slice, i, signal) => {
			aStarted = true;
			try {
				await new Promise((resolve, reject) => {
					if (signal.aborted)
						return reject(new Error('AbortError'));
					signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
				});
			} catch (e) {
				aStopped = true;
				throw e;
			}
		}, 10, { size: 1 });

		// Wait for job to start
		for (let i = 0; i < 20 && !aStarted; i++)
			await new Promise(r => setTimeout(r, 10));
		assert.ok(aStarted, 'Job should have started');

		await clear();

		await new Promise(r => setTimeout(r, 20));
		assert.ok(aStopped, 'Job should have recorded stop after clear');
	});

	await t.test('priority - high-priority tasks preempt', async () => {
		const result = [];
		const low = batch('Low', async slice => {
			result.push('L' + slice[0]);
		}, [1, 2], { size: 1, interval: 200, priority: 0 });

		await new Promise(r => setTimeout(r, 50));

		const high = batch('High', async slice => {
			result.push('H' + slice[0]);
		}, [1], { size: 1, priority: 1 });

		await Promise.all([low, high]);
		assert.deepStrictEqual(result, ['L1', 'H1', 'L2']);
	});
});
