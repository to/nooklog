document.documentElement.classList.add(
	window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.lang = navigator.language.slice(0, 2);
