export const merge = (target, source) => {
	Object.keys(source).forEach(key => {
		if (source[key] !== undefined)
			target[key] = source[key];
	});
	return target;
};

export default {
	merge,
};
