class ProgressBar extends Component {
	initialize() {
		this.timer = null;
		this.hide();
		this.innerHTML = /* html */`
			<div class="label"></div>
			<div class="bar"></div>`;
	}

	bindEvents() {
		hub.on('server:queue.progress', msg => {
			const { value, total, label } = msg;
			const percent = (value / total) * 100;

			this.show();
			this.$('.bar').style.setProperty('--progress', `${percent}%`);
			this.$('.label').textContent = `${label} (${value}/${total})`;

			// Hide after some time when complete
			clearTimeout(this.timer);
			if (value >= total)
				this.timer = setTimeout(() => this.hide(), 2000);
		});
	}
}

customElements.define('nl-progress-bar', ProgressBar);
