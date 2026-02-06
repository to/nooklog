export const merge = (target, source) => {
	Object.keys(source).forEach(key => {
		if (source[key] !== undefined)
			target[key] = source[key];
	});
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

export default {
	merge,
	bench,
};
