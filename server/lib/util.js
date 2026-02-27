import baseLogger from './logger.js';

const logger = baseLogger.child({ module: 'util' });

export const merge = (target = {}, source) => {
	for (const key of Object.keys(source)) {
		if (source[key] === undefined)
			continue;

		if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target)
			merge(target[key], source[key]);
		else
			target[key] = source[key];
	}

	return target;
};

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

export default {
	merge,
	bench,
	parseNumber,
};
