class Component extends HTMLElement {
	constructor() {
		super();

		// 詳細度(特異性)を上げるためクラス名を割り当て利用する
		const name = this.constructor.name;
		this.classList.add(name);

		// サーバーが動的に生成したHTMLテンプレートを読み込む
		const template = window[name + '_html'];
		if (template)
			this.innerHTML = template;

		const initialized = new Promise(resolve =>
			requestAnimationFrame(async () => {
				await this.initialize?.();
				this.bindEvents?.();
				resolve();
			}));
		hub.on('Nooklog:load', () =>
			initialized.then(() => this.ready?.()));
	}

	$(sel) {
		return this.querySelector(sel);
	}

	$$(sel) {
		return [...this.querySelectorAll(sel)];
	}

	show() {
		this.classList.remove('none');
	}

	hide() {
		this.classList.add('none');
	}

	toggle(visible) {
		this.classList.toggle('none', !visible);
	}
}
