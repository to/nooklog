export const merge = (target, source) => {
	Object.keys(source).forEach(key => {
		if (source[key] !== undefined)
			target[key] = source[key];
	});
	return target;
};

export const sql = (strings, ...values) => {
	let result = strings[0];
	for (let i = 0; i < values.length; i++) {
		const val = values[i];
		if (typeof val === "string") {
			result += `'${val.replace(/'/g, "''")}'`;
		} else if (val === undefined || val === null) {
			result += "NULL";
		} else {
			result += val;
		}
		result += strings[i + 1];
	}
	return result;
};

export default {
	merge,
	sql,
};
