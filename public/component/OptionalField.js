class OptionalField extends Component {
	initialize() {
		this.input = this.$('input, textarea');
		this.style.display = 'contents';
		this.hide();
	}

	set value(value) {
		this.toggle(!!value);
		this.input.value = value;
	}

	get value() {
		return this.input.value;
	}
}

customElements.define('nl-optional-field', OptionalField);
