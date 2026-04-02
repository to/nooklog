import PQueue from 'p-queue';
import hub from './hub.js';
import { wait } from './util.js';

// Central task queue with concurrency control to prevent engine overload
const queue = new PQueue({ concurrency: 1 });

export const batch = (list, task, {
	size = 100,
	interval = 16,
	label = 'batch',
	priority = 0,
} = {}) => {
	const controller = new AbortController();
	const { signal } = controller;

	const promise = (async () => {
		for (let i = 0; i < list.length; i += size) {
			// Early exit if the job was cancelled during the delay or previous task
			if (signal.aborted)
				return;

			const slice = list.slice(i, i + size);
			await queue.add(async () => {
				// Prevent execution if the job was cancelled while waiting in the queue
				if (signal.aborted)
					return;

				await task(slice, i, signal);
			}, { priority, signal });

			if (list.length > size) {
				hub.emit('progress', {
					label,
					value: Math.min(i + size, list.length),
					total: list.length,
				});
			}

			// Yield control to let other high-priority tasks (e.g. saves) slip into the queue
			if (i + size < list.length)
				await wait(interval);
		}
	})();

	// Trigger cancellation and return the promise so others can wait for disposal
	promise.abort = () => {
		controller.abort();
		return promise;
	};
	return promise;
};

export const idle = () => queue.onIdle();
export const clear = () => queue.clear();

export default {
	batch,
	idle,
	clear,
};
