class RatingInput {
	constructor(el) {
		this.els = { input: el };
		this.value = parseInt(this.els.input.value) || 0;

		this._init();
		this._render('active');
	}

	_init() {
		this.els.input.classList.add('none');
		this.els.rating = document.createElement('div');
		this.els.rating.className = 'input-rating';

		this.els.stars = [...Array(5)].map((_, i) => this._createStar(i + 1));
		this.els.rating.append(...this.els.stars);

		this.els.input.after(this.els.rating);
	}

	_createStar(index) {
		const span = document.createElement('span');
		span.className = 'icon btn-text';
		span.textContent = 'star';

		span.addEventListener('click', () => {
			this.value = (this.value === index) ? 0 : index;
			this.els.input.value = this.value;
			this.els.input.dispatchEvent(new Event('change', { bubbles: true }));
			this._render('active');
			this._render('hover', 0);
		});

		span.addEventListener('mouseenter', () => {
			this._render('active', 0);
			this._render('hover', index);
		});
		span.addEventListener('mouseleave', () => {
			this._render('active');
			this._render('hover', 0);
		});

		return span;
	}

	_render(cls, index) {
		index = index ?? this.value;
		this.els.stars.forEach((s, i) => {
			s.classList.toggle(cls, index >= (i + 1));
		});
	}

	setValue(val) {
		this.value = parseInt(val) || 0;
		this.els.input.value = this.value;
		this._render('active');
	}

	getValue() {
		return this.value;
	}

	hide() {
		this.els.rating.classList.add('none');
	}
}

window.RatingInput = RatingInput;
