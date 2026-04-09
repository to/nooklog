class RatingInput extends Component {
	static HTML = [1, 2, 3, 4, 5].map(i =>
		`<button type="button" class="flat icon" data-rating="${i}">star</button>`).join('');

	// 1つのイベントハンドラで多数のインスタンスを処理する
	static {
		hub.once('Nooklog:load', () => {
			if (config['server.mode'] === 'readonly')
				return;

			document.addEventListener('click', e => {
				const el = e.target.closest('nl-rating');
				if (!el)
					return;

				const button = e.target.closest('[data-rating]');
				if (!button)
					return;

				const rating = +button.dataset.rating;
				el.value = (+el.dataset.rating === rating) ? 0 : rating;
				el.classList.remove('is-over');
				el.dispatchEvent(new Event('change', { bubbles: true }));
			});

			document.addEventListener('mouseover', e => {
				const el = e.target.closest('nl-rating');
				if (el)
					el.classList.add('is-over');
			});

			document.addEventListener('mouseout', e => {
				const el = e.target.closest('nl-rating');
				if (el && !el.contains(e.relatedTarget))
					el.classList.remove('is-over');
			});
		});
	}

	constructor() {
		super();
		this.innerHTML = RatingInput.HTML;
	}

	get value() {
		return +this.dataset.rating || 0;
	}

	set value(val) {
		this.dataset.rating = val || 0;
	}
}

customElements.define('nl-rating', RatingInput);
