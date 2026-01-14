import js from '@eslint/js';
import globals from 'globals';

export default [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.node,
				...globals.browser,
				...globals.deno,
			},
		},
		rules: {
			'quotes': ['error', 'single'],
			'indent': ['error', 'tab'],
			'semi': ['error', 'always'],
			'comma-dangle': ['error', 'always-multiline'],
			'no-unused-vars': 'off', // 自由に使いたい
			'no-useless-escape': 'off', // 正規表現のエスケープは安全側に倒したい
			'no-console': 'off',
			'no-undef': 'off', // いちいち定義するのが面倒なのでオフ！
			'no-multiple-empty-lines': ['error', { 'max': 1, 'maxEOF': 0 }], // 空行は1行まで！
			'arrow-parens': ['error', 'as-needed'], // 1つならカッコは書かない！
			'curly': ['error', 'multi-or-nest', 'consistent'], // 1行なら省略OK、でもif-elseで片方にあるなら揃える！
			'nonblock-statement-body-position': ['error', 'below'], // カッコなしの時は必ず改行する！
			'dot-location': ['error', 'property'], // ドットはプロパティと同じ行（ドット始まり）！
			'no-constant-condition': 'none',
		},
	},
	// Userscript 用に GM_ 関数の定義を許可する設定
	{
		files: ['*.user.js', 'userscript.js'],
		languageOptions: {
			globals: {
				...globals.greasemonkey,
			},
		},
	},
];
