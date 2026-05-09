class BusyButton extends Component {
	initialize() {
		this.button = this.$('button');
		this.originalText = this.button.textContent;
		this.style.display = 'contents';
	}

	disable(ms) {
		this.button.disabled = true;

		const busyText = this.button.dataset.busyText;
		if (busyText)
			this.button.textContent = busyText;

		if (ms)
			setTimeout(() => this.enable(), ms);
	}

	enable() {
		this.button.disabled = false;
		this.button.textContent = this.originalText;
	}

	set onClick(fn) {
		$.on(this.button, 'click', async e => {
			try {
				this.disable();
				await fn(e);
			} finally {
				this.enable();
			}
		});
	}
}

customElements.define('nl-busy-button', BusyButton);
