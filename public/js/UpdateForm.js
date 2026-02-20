const MEMO_DELIMITER = '/';
const WINDOW_WIDTH = 500;
const WINDOW_HEIGHT = 480;
const WINDOW_MARGIN = 25;

class UpdateForm {
	constructor() {
		this.els = {
			form: $('#form-update'),
			error: $('#error'),
			detach: $('#btn-detach'),
			close: $('#btn-close'),
			url: $('#url'),
			title: $('#title'),
			memo: $('#memo'),
			tags: $('input[name=tags]'),
			html: $('#html'),
		};
		this.tagInput = new TagInput(this.els.tags);
		this.tagInput.focus();

		this.originalMemo = '';

		this._init();
		this._bindEvents();
	}

	async _init() {
		const ps = getSearchParams();
		this.id = ps.id;
		this.sessionId = ps.sessionId;

		if (ps.url)
			this.els.url.value = ps.url;

		if (ps.title)
			this.els.title.value = ps.title;

		// 既存データを取得する
		try {
			const bookmark = this.id ?
				await Nookmark.getBookmark(this.id) :
				ps.url ?
					await Nookmark.findByUrl(ps.url) : null;

			if (bookmark)
				this._populate(bookmark);
		} catch (err) {
			this.showError(err.message);
		}

		// 編集内容を引き継ぐ
		if (isExtension) {
			const prefix = 'session:' + this.sessionId + ':';
			const items = await chrome.storage.local.get();
			if (items[prefix + 'html'])
				this.els.html.value = items[prefix + 'html'];

			if (items[prefix + 'memo'])
				this.els.memo.value = items[prefix + 'memo'];

			if (items[prefix + 'tags'])
				this.tagInput.setTags(JSON.parse(items[prefix + 'tags']));

			chrome.storage.local.remove(
				Object.keys(items).filter(k => k.startsWith(prefix)));
		}
	}

	_bindEvents() {
		this.els.detach.addEventListener('click', () => this.detach());
		this.els.close.addEventListener('click', () => this.close());

		document.addEventListener('keydown', async e => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
				await this._handleSubmit();
		});

		if (!isFrame) {
			window.addEventListener('beforeunload', e => {
				// ブラウザのデフォルトメッセージが表示される
				if (this.originalMemo !== this.els.memo.value)
					e.returnValue = 'Changes you made may not be saved.';
			});
		}

		this.els.form.addEventListener('submit', async e => {
			e.preventDefault();
			await this._handleSubmit();
		});

		// 拡張内で開かれているか？
		if (isExtension) {
			chrome.runtime.onMessage.addListener(msg => {
				if (msg.sessionId !== this.sessionId)
					return;

				// コンテンツページで新たなテキストが選択されたか？
				if (msg.selection && this.previousSelection !== msg.selection) {
					this.previousSelection = msg.selection;

					const { selectionStart: start, selectionEnd: end } = this.els.memo;
					const delimiter = (!start || /[／\/、。←→]/u.test(
						this.els.memo.value.slice(start - 1, start)))
						? '' : MEMO_DELIMITER;
					this.els.memo.setRangeText(delimiter + msg.selection, start, end, 'end');
					this.els.memo.focus();
				}
			});
		}
	}

	_populate(bookmark) {
		this.els.url.value = bookmark.url;
		this.els.title.value = bookmark.title;
		this.els.memo.value = bookmark.memo || '';
		this.originalMemo = this.els.memo.value;
		this.tagInput.setTags(
			[].concat(bookmark.rating || [], bookmark.tags || []));
	}

	showError(message) {
		this.els.error.textContent = message;
		this.els.error.style.display = 'block';
	}

	hideError() {
		this.els.error.style.display = 'none';
	}

	close() {
		window.close();
		window.parent.postMessage({ type: 'close' }, '*');
	}

	async detach() {
		// 編集内容を引き継ぐ
		const prefix = 'session:' + this.sessionId + ':';
		await chrome.storage.local.set({
			[prefix + 'html']: this.els.html.value,
			[prefix + 'memo']: this.els.memo.value,
			[prefix + 'tags']: JSON.stringify(this.tagInput.getTags()),
		});

		// 拡張の機能を使いクロスオリジンでも確実にウィンドウを開く
		const display = await getCurrentDisplay();
		const area = display.workArea;
		await chrome.windows.create({
			url: chrome.runtime.getURL('public/update.html')
				+ `?url=${encodeURIComponent(this.els.url.value)}`
				+ `&title=${encodeURIComponent(this.els.title.value)}`
				+ `&sessionId=${this.sessionId}`
				+ (this.id ? `&id=${this.id}` : ''),
			type: 'popup',
			width: WINDOW_WIDTH,
			height: WINDOW_HEIGHT,
			left: area.left + area.width - WINDOW_WIDTH - (WINDOW_MARGIN + 6),
			top: area.top + area.height - WINDOW_HEIGHT - (WINDOW_MARGIN - 24),
		});
		window.parent.postMessage({ type: 'close' }, '*');
	}

	async _handleSubmit() {
		this.hideError();
		try {
			await Nookmark.updateBookmark({
				id: this.id,
				url: this.els.url.value,
				title: this.els.title.value,
				memo: this._normalizeText(this.els.memo.value),
				tags: this.tagInput.getTags(),
				html: this.els.html.value,
			});

			// 編集結果をオリジナルとする(beforeunloadでチェック)
			this.originalMemo = this.els.memo.value;

			this.close();
		} catch (err) {
			this.showError(err.message);
		}
	}

	_normalizeText(text) {
		return text
			.replace(/（/g, '(')
			.replace(/）/g, ')')
			.replace(/／/g, '/');
	}
}

async function getCurrentDisplay() {
	const currentWin = await chrome.windows.getCurrent();
	const centerX = currentWin.left + currentWin.width / 2;
	const displays = await chrome.system.display.getInfo();
	return displays.find(d =>
		(centerX >= d.workArea.left) && (centerX < d.workArea.left + d.workArea.width),
	) || displays[0];
}

new UpdateForm();
