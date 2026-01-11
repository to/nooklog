import PQueue from 'p-queue';
import hub from './hub.js';
import { wait } from './util.js';

// Central task queue with concurrency control to prevent engine overload
const queue = new PQueue({ concurrency: 1 });
const activeBatches = new Map();

export const batch = (list, task, {
	size = 100,
	interval = 16,
	label = 'batch',
	priority = 0,
} = {}) => {
	const controller = new AbortController();
	const { signal } = controller;

	// Keep track of the previous batch promise at this priority level to ensure serialization
	const prev = activeBatches.get(priority) || Promise.resolve();

	const promise = (async () => {
		try {
			// Wait for the previous batch of the same priority to complete (ignore its success/failure)
			try {
				await prev;
			} catch {
				// Continue to next batch even if previous failed
			}

			for (let i = 0; i < list.length; i += size) {
				if (signal.aborted)
					return;

				const slice = list.slice(i, i + size);
				await queue.add(async () => {
					// PQueue with signal will automatically skip if aborted, but task also needs it
					await task(slice, i, signal);
				}, { priority, signal });

				if (list.length > size) {
					hub.emit('queue.progress', {
						label,
						value: Math.min(i + size, list.length),
						total: list.length,
					});
				}

				// Yield control to let higher-priority tasks jump ahead during this wait
				if (i + size < list.length)
					await wait(interval);
			}
		} catch (err) {
			if (err.name === 'AbortError')
				return;

			throw err;
		}
	})();

	// Update the map to chain next batches to this one
	activeBatches.set(priority, promise);

	// Trigger cancellation and return the promise so others can wait for disposal
	promise.abort = () => {
		controller.abort();
		return promise;
	};
	return promise;
};

export const idle = () => queue.onIdle();
export const clear = () => {
	queue.clear();
	activeBatches.clear();
};

export default {
	batch,
	idle,
	clear,
};
