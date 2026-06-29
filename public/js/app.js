const app = {
	// Save lightweight UI state
	// (Cannot replace config as iframe and normal pages have different settings)
	...JSON.parse(localStorage.getItem('ui') || '{}'),

	// view modes: embed, sidepanel, window, popup, or empty (home screen)
	view: getSearchParams().view || 'home',

	noTitle: '[No Title]',

	set(key, value) {
		this[key] = value;
		localStorage.setItem('ui', JSON.stringify(this));
	},

	get(key, def) {
		return this[key] ?? def;
	},

	notify(opt) {
		this.showToast({
			className: 'toast-info',
			...opt,
		});
	},

	error(e) {
		console.error(e.message, e);
		this.showToast({
			duration: -1,
			className: 'toast-error',
			text: e.message || e,
		});
	},

	showToast(opt) {
		const toastify = Toastify({
			duration: 2000,
			selector: document.querySelector('dialog[open]') || document.body,
			gravity: 'bottom',
			position: 'left',
			stopOnFocus: true,
			...opt,
		});
		const toastifyElm = toastify.showToast().toastElement;

		let buttonElm = document.createElement('button');
		buttonElm.type = 'button';
		if (opt.duration === -1)
			buttonElm.innerHTML = '<span class="icon">close<span>';

		if (opt.buttonText)
			buttonElm.textContent = opt.buttonText;

		if (buttonElm.innerHTML) {
			buttonElm.onclick = e => {
				e.stopPropagation();
				opt.onButtonClick?.();
				toastify.hideToast();
			};
			toastifyElm.appendChild(buttonElm);
		}
	},

	renderMarkdown(b = {}) {
		const { meta, body } = parseFrontmatter(b.markdown || '');

		const headers = [];
		if (meta.title || meta.source || meta.url || meta.archive) {
			const text = sanitize(meta.site ? `${meta.title} - ${meta.site}` : meta.title || app.noTitle);
			const url = meta.archive || meta.source || meta.url;
			const inner = url
				? `<a href="${sanitize(url)}" target="_blank">${text}</a>`
				: text;
			headers.push(`<h1>${inner}</h1>`);
		}

		['description', 'summary'].forEach(k => {
			const val = meta[k] || b[k];
			if (val)
				headers.push(`<p>${sanitize(val).replace(/\n/g, '<br>')}</p>`);
		});

		const frontmatterHtml = headers.length > 0 ? `<div class="frontmatter">${headers.join('')}</div>` : '';
		const bodyHtml = DOMPurify.sanitize(marked.parse(body), {
			ADD_TAGS: ['iframe'],
		});
		return `<div class="markdown">${frontmatterHtml}${bodyHtml}</div>`;
	},
};
document.documentElement.dataset.view = app.view;

const hub = new EventEmitter();
hub.once('Nooklog:load', () => {
	updateTheme();
	updateTint();
});

const bridge = (() => {
	const ps = getSearchParams();
	const tabId = Number(ps.tabId || 0);
	const windowId = Number(ps.windowId || 0);

	return {
		on: (event, listner, opt = {}) => {
			window.addEventListener(`Nooklog:${event}`, ({ detail }) => {
				if (opt.tab && detail.tabId !== tabId)
					return;

				if (opt.window && detail.windowId !== windowId)
					return;

				listner(detail.message, detail);
			});
		},
		emit: (event, msg = {}, opt = {}) => {
			// Relay via postMessage if the bridge script is missing in popups
			let detail = { event, message: msg, tabId, windowId, ...opt };
			if (window.parent === window)
				window.dispatchEvent(new CustomEvent('Nooklog:Bridge:transfer', { detail }));
			else
				window.parent.postMessage({ type: 'Bridge:transfer', ...detail }, '*');
		},
	};
})();

const eventSource = new EventSource('/api/event');
eventSource.onmessage = event => {
	const msg = JSON.parse(event.data);
	hub.emit(`server:${msg.type}`, msg);
};
eventSource.onerror = error => { };

window.onerror = error => app.error(error);
window.onunhandledrejection = event => app.error(event.reason);

const updateTint = () => {
	const tint = config['client.tint'];
	document.documentElement.style
		.setProperty('--color-1', `var(--${tint}-11)`);
};

function parseFrontmatter(text = '') {
	const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
	if (!match)
		return { meta: {}, body: text };

	const meta = {};
	let key;
	match[1].split('\n').forEach(line => {
		const parts = line.match(/^([^:\s]+):\s*(.*)$/);
		if (parts) {
			key = parts[1];
			const val = parts[2].trim();
			meta[key] = val === '|-' ? '' : val.replace(/^["'](.*)["']$/, '$1');
		} else if (key && line.startsWith('  ')) {
			meta[key] += (meta[key] ? '\n' : '') + line.slice(2);
		}
	});
	return { meta, body: text.slice(match[0].length) };
}
