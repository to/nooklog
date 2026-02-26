class RatingInput {
	constructor(el) {
		this.els = { input: el };
		this.value = parseInt(this.els.input.value) || 0;

		this._init();
		this._bindEvents();
	}

	_init() {
		this.els.input.classList.add('none');
		this.els.rating = document.createElement('div');
		this.els.rating.className = 'input-rating';
		this.els.rating.dataset.rating = this.value;

		this.els.rating.innerHTML = [1, 2, 3, 4, 5].reduceRight((acc, i) =>
			`<span class="icon btn-text${i == this.value ? ' active' : ''}" data-rating="${i}">` +
			`star${acc}` +
			'</span>', '');

		this.els.input.after(this.els.rating);
	}

	_bindEvents() {
		this.els.rating.addEventListener('click', e => {
			const star = e.target.closest('.icon');
			if (!star)
				return;

			const rating = +star.dataset.rating;
			this.value = (this.value === rating) ? 0 : rating;
			this.els.input.value = this.value;
			this.els.rating.dataset.rating = this.value;
			this.els.rating.classList.remove('hover');

			this.els.rating.querySelectorAll('.icon').forEach(s =>
				s.classList.toggle('active', s.dataset.rating == this.value));

			this.els.input.dispatchEvent(new Event('change', { bubbles: true }));
		});

		this.els.rating.addEventListener('mouseover', () =>
			this.els.rating.classList.add('hover'));

		this.els.rating.addEventListener('mouseout', e => {
			if (!this.els.rating.contains(e.relatedTarget))
				this.els.rating.classList.remove('hover');
		});
	}

	setValue(val) {
		this.value = parseInt(val) || 0;
		this.els.input.value = this.value;
		this.els.rating.dataset.rating = this.value;
		this.els.rating.querySelectorAll('.icon').forEach(s =>
			s.classList.toggle('active', s.dataset.rating == this.value));
	}

	getValue() {
		return this.value;
	}

	hide() {
		this.els.rating.classList.add('none');
	}
}

window.RatingInput = RatingInput;
