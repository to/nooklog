const TOAST_ICONS = {
	info: 'info',
	error: 'error',
	success: 'check_circle',
	warning: 'warning',
};

class Toast extends Component {
	constructor(message, type = 'info', ms = 2500) {
		super();
		this.classList.add(type);
		this.setAttribute('popover', 'manual');
		this.innerHTML = `<span class="icon">${TOAST_ICONS[type]}</span>
			<span>${sanitize(message)}</span>`;

		document.body.appendChild(this);
		this.showPopover();

		if (type === 'error')
			this.addEventListener('click', () => this.remove());
		else
			this._timer = setTimeout(() => this.remove(), ms);
	}

	remove(ms = 400) {
		clearTimeout(this._timer);
		this.classList.add('is-removing');
		setTimeout(() => super.remove(), ms);
	}
}

customElements.define('nl-toast', Toast);
