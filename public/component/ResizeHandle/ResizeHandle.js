class ResizeHandle extends Component {
	constructor(target, { direction = 'vertical', min = 50, max = Infinity, position = 'after', key = null, size = null } = {}) {
		super();
		this.target = target;
		this.min = min;
		this.max = max;
		this.position = position;
		this.key = key;
		this.property = direction === 'vertical' ? 'height' : 'width';
		this.axis = direction === 'vertical' ? 'clientY' : 'clientX';

		this.classList.add(direction);

		this.innerHTML = '<hr>';
		position === 'before' ? target.before(this) : target.after(this);

		const value = key ? app.get(key, size) : size;
		if (value)
			target.style[this.property] = value;
	}

	bindEvents() {
		$.on(this, 'pointerdown', e => {
			e.preventDefault();
			this.setPointerCapture(e.pointerId);
			const startPos = e[this.axis];
			const startSize = this.target.getBoundingClientRect()[this.property];

			const onMove = e => {
				const delta = e[this.axis] - startPos;
				const size = Math.min(this.max,
					Math.max(this.min, startSize + (this.position === 'before' ? -delta : delta)));
				this.target.style[this.property] = `${size}px`;
			};

			const onUp = () => {
				this.removeEventListener('pointermove', onMove);
				this.removeEventListener('pointerup', onUp);

				if (this.key)
					app.set(this.key, `${this.target.getBoundingClientRect()[this.property]}px`);
			};

			this.addEventListener('pointermove', onMove);
			this.addEventListener('pointerup', onUp);
		});
	}
}

customElements.define('nl-resize-handle', ResizeHandle);
