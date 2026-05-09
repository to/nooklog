const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

$.show = el => el?.classList.remove('none');

$.hide = el => el?.classList.add('none');

$.on = (el, type, fn, opts) => el?.addEventListener(type, fn, opts);

$.toggle = (el, force) => el?.classList.toggle('none', force != null ? !force : undefined);

$.create = (tag, props = {}) => Object.assign(document.createElement(tag), props);

$.observeResize = (el, fn) => {
	new ResizeObserver(entries =>
		requestAnimationFrame(() => fn(entries[0]))).observe(el);
};

$.check = (els, val) => {
	if (val == null)
		return;
	const list = Array.isArray(val) ? val : String(val).split(',').filter(Boolean);
	els.forEach(el => el.checked = list.includes(el.value));
};

$.selectFile = accept => new Promise(resolve => {
	const input = $.create('input', { type: 'file', accept });
	input.onchange = () => resolve(input.files[0]);
	input.click();

	// Detect cancellation by monitoring window focus return
	window.addEventListener('focus', () => {
		setTimeout(() => resolve(input.files[0]), 500);
	}, { once: true });
});

const qs = obj => new URLSearchParams(obj).toString();
const getSearchParams = () => Object.fromEntries(new URLSearchParams(location.search));

const setSearchParams = (ps = {}) => {
	const params = new URLSearchParams();
	for (const [key, val] of Object.entries(ps)) {
		if (val === undefined || val === null || val === '')
			continue;

		const str = Array.isArray(val) ? val.join(',') : val;
		params.set(key, str);
	}

	const search = params.toString();
	const url = new URL(location);
	url.search = search ? '?' + search : '';
	history.replaceState(null, '', url);
};

const _escapeEl = document.createElement('div');
const sanitize = str => {
	_escapeEl.textContent = str;
	return _escapeEl.innerHTML;
};

const html = (texts, ...values) => {
	return values.reduce((acc, v, i) =>
		acc + texts[i] + sanitize(v), texts[0]) + texts.at(-1);
};

const throttle = (f, ms = 100, ...args) => {
	if (typeof f !== 'function')
		return f[ms] = throttle(f[ms].bind(f), args[0]);

	let last = 0;
	return function (...args) {
		const now = Date.now();
		if (now - last < ms)
			return;
		last = now;
		f.apply(this, args);
	};
};

const debounce = (f, ms = 100, ...args) => {
	if (typeof f !== 'function')
		return f[ms] = debounce(f[ms].bind(f), args[0]);

	let timer;
	return function (...args) {
		clearTimeout(timer);
		timer = setTimeout(() => f.apply(this, args), ms);
	};
};

const throttleAndDebounce = (f, ms = 100, ...args) => {
	if (typeof f !== 'function')
		return f[ms] = throttleAndDebounce(f[ms].bind(f), args[0]);

	let last = 0, timer;
	return function (...args) {
		const now = Date.now();
		clearTimeout(timer);
		if (now - last < ms) {
			timer = setTimeout(() => (last = now, f.apply(this, args)), ms);
		} else {
			last = now;
			f.apply(this, args);
		}
	};
};

const beforeHook = (target, name, fn) => {
	const original = target[name];
	target[name] = function (...args) {
		fn.apply(this, args);
		return original.apply(this, args);
	};
};

const afterHook = (target, name, fn) => {
	const original = target[name];
	target[name] = function (...args) {
		const result = original.apply(this, args);
		return fn.call(this, result, ...args) ?? result;
	};
};

const isEmpty = obj => !obj || Object.keys(obj).length === 0;
