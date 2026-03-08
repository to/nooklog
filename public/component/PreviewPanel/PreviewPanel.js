class PreviewPanel extends Component {
	initialize() {
		this.els = {
			panel: this.$('aside'),
			content: this.$('.content'),
			close: this.$('button.close'),
			edit: this.$('button.edit'),
			preview: this.$('button.preview'),
		};

		this.updateForm = this.$('nl-update-form');
		this.updateForm.hide();

		new ResizeHandle(this.els.panel, {
			direction: 'horizontal',
			position: 'before',
			key: 'PreviewPanel.width',
			size: '43vw',
		});
		new ResizeHandle(this.els.panel, {
			direction: 'vertical',
			position: 'before',
			key: 'PreviewPanel.height',
			size: '43vh',
		});

		marked.use({
			breaks: true,
		});

		this.hide();
	}

	bindEvents() {
		hub.on('ResultTable:select', bookmark => {
			this._render(bookmark);

			this.show();
			app.get('PreviewPanel.edit', false) ?
				this._showEdit() :
				this._showPreview();
		});

		hub.on('UpdateForm:save', bookmark => {
			this._render(bookmark);
		});

		$.on(this.els.close, 'click', () => {
			this.hide();
			hub.emit('PreviewPanel:close');
		});

		$.on(this.els.edit, 'click', () => {
			this._showEdit();
		});

		$.on(this.els.preview, 'click', () => {
			this._showPreview();
		});

		$.on(this.els.panel, 'error', e => {
			if (e.target.tagName === 'IMG') {
				const alt = e.target.alt;
				e.target.outerHTML = /* html */`<span class="broken-image-label">
					<span class="icon">broken_image</span>
					${alt ? `<span class="text">${sanitize(alt)}</span>` : ''}
				</span>`;
			}
		}, true);
	}

	_showPreview() {
		$.show(this.els.content);
		this.updateForm.hide();
		app.set('PreviewPanel.edit', false);

		$.hide(this.els.preview);
		$.show(this.els.edit);
	}

	_showEdit() {
		$.hide(this.els.content);
		this.updateForm.show();
		app.set('PreviewPanel.edit', true);

		$.show(this.els.preview);
		$.hide(this.els.edit);
	}

	_render(bookmark) {
		this.els.panel.scrollTop = 0;
		this.els.content.innerHTML = app.renderMarkdown(bookmark.markdown);
	}
}

customElements.define('nl-preview-panel', PreviewPanel);
