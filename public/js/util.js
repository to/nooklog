const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

const _escape = document.createElement('div');
const html = (strings, ...values) => strings.reduce((acc, str, i) => {
	if (i < values.length) {
		_escape.textContent = values[i];
		return acc + str + _escape.innerHTML;
	}
	return acc + str;
}, '');
