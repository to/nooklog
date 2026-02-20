export const merge = (target = {}, source) => {
	for (const key of Object.keys(source)) {
		if (source[key] instanceof Object && key in target)
			Object.assign(source[key], merge(target[key], source[key]));
	}

	Object.assign(target, source);
	return target;
};

export const bench = async (task, label = 'bench') => {
	const start = performance.now();
	const result = typeof task === 'function' ?
		await task() :
		await task;
	console.log(`⏱️ ${label}: ${(performance.now() - start).toFixed(2)}ms`);
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
