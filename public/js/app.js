const app = {
	// Save lightweight UI state
	// (Cannot replace config as iframe and normal pages have different settings)
	...JSON.parse(localStorage.getItem('ui') || '{}'),

	set(key, value) {
		this[key] = value;
		localStorage.setItem('ui', JSON.stringify(this));
	},

	get(key, def) {
		return this[key] ?? def;
	},

	notify(message, type = 'info', ms) {
		return new Toast(message, type, ms);
	},

	error(e) {
		return this.notify(e?.message || e, 'error');
	},

	renderMarkdown(b = {}) {
		let markdown = b.markdown || '';
		let frontmatterHtml = '';
		const headers = [];
		const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);

		if (match) {
			const content = match[1];
			markdown = markdown.slice(match[0].length);

			const meta = {};
			let key;
			content.split('\n').forEach(line => {
				const parts = line.match(/^([^:\s]+):\s*(.*)$/);
				if (parts) {
					key = parts[1];
					const val = parts[2].trim();
					meta[key] = val === '|-' ? '' : val.replace(/^["'](.*)["']$/, '$1');
				} else if (key && line.startsWith('  ')) {
					meta[key] += (meta[key] ? '\n' : '') + line.slice(2);
				}
			});

			if (meta.title) {
				const text = meta.site ? `${meta.title} - ${meta.site}` : meta.title;
				const inner = meta.url ? `<a href="${sanitize(meta.url)}" target="_blank">${sanitize(text)}</a>` : sanitize(text);
				headers.push(`<h1>${inner}</h1>`);
			}

			['description', 'summary'].forEach(k => {
				const val = meta[k] || b[k];
				if (val)
					headers.push(`<p>${sanitize(val).replace(/\n/g, '<br>')}</p>`);
			});

			if (headers.length > 0)
				frontmatterHtml = `<div class="frontmatter">${headers.join('')}</div>`;
		}

		return `<div class="markdown">${frontmatterHtml}${DOMPurify.sanitize(marked.parse(markdown))}</div>`;
	},
};

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
			let detail = { message: msg, tabId, windowId, ...opt };
			if (!opt.local) {
				detail = { event, ...detail };
				event = 'Bridge:transfer';
			}
			window.dispatchEvent(new CustomEvent(`Nooklog:${event}`, { detail }));
		},
	};
})();

const eventSource = new EventSource('/api/event');
eventSource.onmessage = event => {
	const msg = JSON.parse(event.data);
	hub.emit(`server:${msg.type}`, msg);
};
eventSource.onerror = error => eventSource.close();

window.onerror = error => app.error(error);
window.onunhandledrejection = event => app.error(event.reason);

const matchingGrays = {
	'tomato': 'mauve',
	'red': 'mauve',
	'ruby': 'mauve',
	'crimson': 'mauve',
	'pink': 'mauve',
	'plum': 'mauve',
	'purple': 'mauve',
	'violet': 'mauve',
	'iris': 'slate',
	'indigo': 'slate',
	'blue': 'slate',
	'cyan': 'slate',
	'teal': 'sage',
	'jade': 'sage',
	'green': 'olive',
	'grass': 'olive',
	'bronze': 'sand',
	'gold': 'sand',
	'brown': 'sand',
	'orange': 'sand',
	'amber': 'sand',
	'yellow': 'sand',
	'lime': 'olive',
	'mint': 'olive',
	'sky': 'slate',
};
const updateTint = () => {
	const root = document.documentElement;
	const tint = config['client.tint'];
	const theme = config['client.theme'];
	const ink = matchingGrays[tint];
	const steps = theme.endsWith('-gray')
		? [5, 6, 8, 9, 9, 11, 12]
		: [2, 3, 6, 8, 9, 11, 12];
	steps.forEach((step, i) => {
		root.style.setProperty(`--ink-${i}`,
			theme.endsWith('-gray') ?
				`hsl(from var(--${ink}-${step}) h calc(s * 0.5) l)` :
				`var(--${ink}-${step})`);
	});
	root.style.setProperty('--color-1', `var(--${tint}-11)`);
};
