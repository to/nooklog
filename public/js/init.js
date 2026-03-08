// Chrome拡張ではセキュリティポリシーによりインラインスクリプトは使えない
const isFrame = window.parent !== window;
if (isFrame)
	document.documentElement.classList.add('frame');

const config = Object.assign({
	'client.theme': 'system',
}, JSON.parse(localStorage.config || '{}'));

function updateTheme() {
	const theme = config['client.theme'] === 'system'
		? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
		: config['client.theme'];
	const list = document.documentElement.classList;
	list.remove('dark', 'light');
	list.add(theme.split('-').shift());
}
updateTheme();

document.documentElement.lang = navigator.language.slice(0, 2);
