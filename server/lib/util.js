import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'util' });

export const merge = (target = {}, source) => {
	for (const key of Object.keys(source)) {
		if (source[key] == null)
			continue;

		if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target)
			merge(target[key], source[key]);
		else
			target[key] = source[key];
	}

	return target;
};

// 元のコードを変形させずに実行実行時間を計測する
export const bench = async (task, label = 'bench') => {
	const start = performance.now();
	const result = typeof task === 'function' ?
		await task() :
		await task;
	const duration = performance.now() - start;
	logger.debug({ label, duration: duration.toFixed(2) }, 'benchmark finished');
	return result;
};

export const parseNumber = val => {
	const n = parseInt(val);
	return isNaN(n) ? undefined : n;
};

export const retry = async (task, { maxAttempts = 3, delay = 500, module = 'retry' } = {}) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			return await task();
		} catch (e) {
			if (i === maxAttempts - 1)
				throw e;

			logger.warn({ module, attempt: i + 1, error: e.message }, 'task failed, retrying...');
			await new Promise(r => setTimeout(r, delay * (2 ** i)));
		}
	}
};

export const groupBy = (list, keyGetter) => {
	const map = new Map();
	for (const item of list) {
		const key = keyGetter(item);
		const group = map.get(key) || [];
		group.push(item);
		map.set(key, group);
	}
	return map;
};

export default {
	merge,
	bench,
	parseNumber,
	retry,
	groupBy,
};
