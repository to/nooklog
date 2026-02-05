export const merge = (target, source) => {
	Object.keys(source).forEach(key => {
		if (source[key] !== undefined)
			target[key] = source[key];
	});
	return target;
};

export const bench = async (promise, label = 'bench') => {
	const start = performance.now();
	const result = await promise;
	console.log(`⏱️ ${label}: ${(performance.now() - start).toFixed(2)}ms`);
	return result;
};

export default {
	merge,
	bench,
};
