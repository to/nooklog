const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const getSearchParams = () => Object.fromEntries(new URLSearchParams(location.search));

const _escapeEl = document.createElement('div');
const sanitize = str => {
	_escapeEl.textContent = str;
	return _escapeEl.innerHTML;
};

const html = (texts, ...values) => {
	// 配列よりも文字列連結の方が速い
	return values.reduce((acc, v, i) =>
		acc + texts[i] + sanitize(v), texts[0]) + texts.at(-1);
};
