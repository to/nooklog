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
