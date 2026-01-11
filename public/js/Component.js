class Component extends HTMLElement {
	static loaded = new Promise(resolve => hub.once('Nooklog:load', resolve));

	constructor() {
		super();

		// Assign class name and use it to increase specificity
		const name = this.constructor.name;
		this.classList.add(name);

		// Load dynamically generated HTML template from server
		const template = window[name + '_html'];
		if (template)
			this.innerHTML = template;

		Promise.all([
			new Promise(resolve =>
				// Wait for Web Component registration
				requestAnimationFrame(async () => {
					await this.initialize?.();
					this.bindEvents?.();
					resolve();
				})),
			Component.loaded,
		]).then(() => this.ready?.());
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
