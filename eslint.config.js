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
			'no-misleading-character-class': 'off',
			'quotes': ['error', 'single', { 'avoidEscape': true, 'allowTemplateLiterals': true }],
			'indent': ['error', 'tab', { 'ignoredNodes': ['TemplateLiteral *'] }],
			'semi': ['error', 'always'],
			'comma-dangle': ['error', 'always-multiline'],
			'no-unused-vars': 'off', // Allow free usage
			'no-useless-assignment': 'off', // Allow re-assignment for variable reuse
			'no-useless-escape': 'off', // Lean towards safety for regex escapes
			'no-console': 'off',
			'no-undef': 'off', // Disable because defining everything is tedious!
			'no-multiple-empty-lines': ['error', { 'max': 1, 'maxEOF': 0 }], // Max 1 empty line!
			'arrow-parens': ['error', 'as-needed'], // Omit parentheses if only one arg!
			'curly': ['error', 'multi-or-nest', 'consistent'], // Can omit for 1 line, but keep consistent for if-else!
			'nonblock-statement-body-position': ['error', 'below'], // Always break line when no brace!
			'dot-location': ['error', 'property'], // Dot on same line as property (dot starts line)!
			'no-constant-condition': 'off',
			'no-unreachable': 'off',
			'no-empty': 'off', // Sometimes we explicitly want empty blocks!
			'no-irregular-whitespace': ['error', {
				'skipRegExps': true,
				'skipTemplates': true,
				'skipStrings': true,
				'skipComments': true,
			}],
		},
	},
	// Allow GM_ functions for Userscript
	{
		files: ['*.user.js', 'userscript.js'],
		languageOptions: {
			globals: {
				...globals.greasemonkey,
			},
		},
	},
];
