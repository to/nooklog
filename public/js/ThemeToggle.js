class ThemeToggle {
	constructor(el) {
		this.el = $('#themeToggle');
		this.el.addEventListener('click', () => this.toggle());
		this._updateIcon();
	}

	toggle() {
		const isDark = document.documentElement.classList.toggle('dark');
		localStorage.theme = isDark ? 'dark' : 'light';
		this._updateIcon();
	}

	_updateIcon() {
		const isDark = document.documentElement.classList.contains('dark');
		this.el.querySelector('span').textContent = isDark ? 'light_mode' : 'dark_mode';
	}
}

new ThemeToggle();
