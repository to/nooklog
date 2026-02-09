const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const getSearchParams = () => Object.fromEntries(new URLSearchParams(location.search));

// HTMLタグは無修正で出力する
// (スクリプトインジェクション攻撃を防ぐサニタイズ機能はない)
const _escape = document.createElement('div');
const html = (strings, ...values) => strings.reduce((acc, str, i) => {
	if (i < values.length) {
		const v = values[i];
		if (typeof v === 'string' && v.startsWith('<') && v.endsWith('>'))
			return acc + str + v;

		_escape.textContent = v;
		return acc + str + _escape.innerHTML;
	}
	return acc + str;
}, '');
