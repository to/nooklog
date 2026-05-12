import baseLog from './log.js';

const log = baseLog.child({ module: 'util' });

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

export const omit = (obj, keys) => {
	const res = { ...obj };
	for (const k of keys)
		delete res[k];
	return res;
};

// Measure execution time without modifying original code
export const bench = async (task, label = 'bench') => {
	const start = performance.now();
	const result = typeof task === 'function' ?
		await task() :
		await task;
	const duration = performance.now() - start;
	log.debug({ label, duration: duration.toFixed(2) }, 'benchmark finished');
	return result;
};

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const cutOff = (promise, ms) => Promise.race([
	promise,
	wait(ms),
]);

export const parseNumber = val => {
	const n = parseInt(val);
	return isNaN(n) ? undefined : n;
};

export const retry = async (task, { maxAttempts = 3, delay = 500, module = 'retry', onRetry } = {}) => {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			return await task();
		} catch (e) {
			if (i === maxAttempts - 1)
				throw e;

			log.warn({ module, attempt: i + 1, error: e.message }, 'task failed, retrying...');
			if (onRetry)
				await onRetry(e, i + 1);

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

export class Warning extends Error {
	constructor(message, cause) {
		super(message, { cause });
		this.name = 'Warning';
	}
}

export const parseFrontmatter = (text = '') => {
	const end = text.startsWith('---') ? text.indexOf('\n---', 3) : -1;
	if (end === -1)
		return { body: text.trim(), meta: {} };

	const meta = {};
	let last;
	text.slice(0, end).split('\n').slice(1).forEach(l => {
		const [k, v] = l.split(/:\s*(.*)/);
		if (v != null) {
			last = k.trim();
			meta[last] = v.trim().replace(/^["']|["']$/g, '');
		} else if (l.trim().startsWith('-')) {
			const val = l.trim().slice(1).trim().replace(/^["']|["']$/g, '');
			meta[last] = [].concat(meta[last] || [], val).filter(Boolean);
		}
	});

	// Normalize
	['created', 'published'].forEach(k => {
		if (meta[k])
			meta[k] = new Date(meta[k]).getTime();
	});

	if (typeof meta.tags === 'string')
		meta.tags = meta.tags.split(',').map(s => s.trim()).filter(Boolean);
	else if (meta.tags)
		meta.tags = [].concat(meta.tags);

	return { meta, body: text.slice(end + 4).trim() };
};

export default {
	merge,
	omit,
	bench,
	parseNumber,
	retry,
	wait,
	cutOff,
	groupBy,
	Warning,
	parseFrontmatter,
};
