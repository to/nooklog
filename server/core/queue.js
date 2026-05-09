import PQueue from 'p-queue';
import hub from './hub.js';
import { wait } from './util.js';

// Central task queue with concurrency control to prevent engine overload
// Concurrency is set > 1 to avoid deadlocks when a task triggers another task (e.g. Backfill -> Save)
const queue = new PQueue({ concurrency: 2 });
const activeJobs = new Map();
const allJobs = new Set();

// Run a single task
export const task = (label, run, opt) => batch(label, run, 1, { ...opt, size: 1 });

// Run a task in batches over a list or a number of times
export const batch = (label, run, items, {
	size = 100,
	interval = 16,
	priority = 0,
	mode = 'queue', // queue (serialize), replace (abort previous), parallel
} = {}) => {
	const controller = new AbortController();
	const { signal } = controller;

	const isNumeric = typeof items === 'number';
	const total = isNumeric ? items : items.length;

	const emitProgress = v => {
		if (total > size) {
			hub.emit('queue.progress', {
				label,
				value: Math.min(v, total),
				total,
			});
		}
	};

	const prev = mode !== 'parallel' ? activeJobs.get(label) : null;

	// Register job before promise starts to ensure tracking even for synchronous exits
	const job = { controller };
	allJobs.add(job);

	const promise = (async () => {
		try {
			if (mode !== 'parallel')
				activeJobs.set(label, job);

			if (prev) {
				if (mode === 'replace')
					prev.controller.abort();

				// Ensure serialization by waiting for previous job to finish/abort
				try {
					await Promise.race([
						prev.promise,
						new Promise(r => signal.addEventListener('abort', r, { once: true })),
					]);
					if (signal.aborted)
						return;
				} catch { }
			}

			emitProgress(0);

			for (let i = 0; i < total; i += size) {
				if (signal.aborted)
					return;

				const slice = isNumeric ? Math.min(size, total - i) : items.slice(i, i + size);
				await queue.add(async () => {
					// PQueue with signal will automatically skip if aborted, but task also needs it
					await run(slice, i, signal);
				}, { priority, signal });

				emitProgress(i + size);

				// Yield control to let higher-priority tasks jump ahead during this wait
				if (i + size < total)
					await wait(interval);
			}
		} catch (err) {
			if (err.name === 'AbortError')
				return;

			throw err;
		} finally {
			emitProgress(total);

			allJobs.delete(job);

			if (activeJobs.get(label) === job)
				activeJobs.delete(label);
		}
	})();

	job.promise = promise;
	job.abort = () => {
		controller.abort();
		return promise;
	};
	promise.abort = job.abort;

	return promise;
};

export const idle = () => queue.onIdle();
export const clear = () => {
	queue.clear();

	const promises = Array.from(allJobs).map(j => j.abort());
	activeJobs.clear();
	return Promise.allSettled(promises);
};

export default {
	task,
	batch,
	idle,
	clear,
};
