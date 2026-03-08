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

const getSearchParams = () => Object.fromEntries(new URLSearchParams(location.search));

const _escapeEl = document.createElement('div');
const sanitize = str => {
	_escapeEl.textContent = str;
	return _escapeEl.innerHTML;
};

const html = (texts, ...values) => {
	return values.reduce((acc, v, i) =>
		acc + texts[i] + sanitize(v), texts[0]) + texts.at(-1);
};

const throttle = (f, ms = 100) => {
	let last = 0;
	return function (...args) {
		const now = Date.now();
		if (now - last < ms)
			return;
		last = now;
		f.apply(this, args);
	};
};

const debounce = (f, ms = 100) => {
	let t;
	return function (...args) {
		clearTimeout(t);
		t = setTimeout(() => f.apply(this, args), ms);
	};
};

const throttleAndDebounce = (f, ms = 100) => {
	let last = 0, t;
	return function (...args) {
		const now = Date.now();
		clearTimeout(t);
		if (now - last < ms) {
			t = setTimeout(() => (last = now, f.apply(this, args)), ms);
		} else {
			last = now;
			f.apply(this, args);
		}
	};
};
