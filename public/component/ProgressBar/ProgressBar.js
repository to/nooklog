class ProgressBar extends Component {
	initialize() {
		this.timer = null;
		this.hide();
		this.innerHTML = '<div class="bar"></div>';
	}

	bindEvents() {
		hub.on('Server.queue.progress', msg => {
			const { value, total, label } = msg;
			const percent = (value / total) * 100;

			this.show();
			this.$('.bar').style.setProperty('--progress', `${percent}%`);
			this.title = `${label} (${value}/${total})`;

			// 完了したら一定時間後に隠す
			clearTimeout(this.timer);
			if (value >= total)
				this.timer = setTimeout(() => this.hide(), 2000);
		});
	}
}

customElements.define('nl-progress-bar', ProgressBar);
