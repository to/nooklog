// Chrome拡張ではセキュリティポリシーによりインラインスクリプトは使えない
isExtension = window.location.protocol === 'chrome-extension:';
isFrame = window.parent !== window;
if (isFrame)
	document.documentElement.classList.add('frame');

config = Object.assign({
	'client.theme': 'system',
}, JSON.parse(localStorage.config || '{}'));

document.documentElement.classList.add(
	(config['client.theme'] === 'system') ?
		(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') :
		config['client.theme']);
document.documentElement.lang = navigator.language.slice(0, 2);
