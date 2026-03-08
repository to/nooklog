// 軽度なUI状態の保存
// (iframeと通常ページは別の設定になるためconfigを代替できない)
const app = {
	...JSON.parse(localStorage.getItem('ui') || '{}'),
	set(key, value) {
		this[key] = value;
		localStorage.setItem('ui', JSON.stringify(this));
	},

	get(key, def) {
		return this[key] ?? def;
	},

	notify(message, type = 'info') {
		return new Toast(message, type);
	},

	error(e) {
		return this.notify(e?.message || e, 'error');
	},

	renderMarkdown(markdown = '') {
		let frontmatterHtml = '';
		const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);

		if (match) {
			const content = match[1];
			markdown = markdown.slice(match[0].length);

			const labels = {
				title: 'Title',
				site: 'Site',
				url: 'URL',
				readerable: 'Readable',
				description: 'Description',
			};

			const rows = content.split('\n').map(line => {
				const parts = line.match(/^([^:]+):\s*(.*)$/);
				if (!parts)
					return '';
				const key = parts[1].trim();
				const value = parts[2].trim().replace(/^["'](.*)["']$/, '$1');
				return `<tr><th>${sanitize(labels[key] || key)}</th>
				<td>${sanitize(value)}</td></tr>`;
			}).join('');

			if (rows)
				frontmatterHtml = `<table class="table-frontmatter">${rows}</table>`;
		}

		return `<div class="markdown">${frontmatterHtml}${DOMPurify.sanitize(marked.parse(markdown))}</div>`;
	},
};

const hub = new EventEmitter();
hub.on('Nooklog:load', () => {
	updateTheme();
	updateTint();
});

const bridge = {
	on: (event, listner) => {
		window.addEventListener(`Nooklog:${event}`, e => listner(e.detail));
	},
	emit: (event, msg = {}, transfer = false) => {
		if (transfer) {
			msg.event = event;
			event = 'Bridge:transfer';
		}
		window.dispatchEvent(new CustomEvent(`Nooklog:${event}`, { detail: msg }));
	},
};

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
	const ink = theme.endsWith('-gray') ? 'gray' : matchingGrays[tint];
	const steps = {
		'dark-gray': [6, 7, 8, 8, 9, 11, 12],
		'light-gray': [5, 6, 8, 9, 9, 11, 12],
	}[theme] || [2, 3, 6, 8, 9, 11, 12];
	steps.forEach((step, i) => {
		root.style.setProperty(`--ink-${i}`, `var(--${ink}-${step})`);
	});
	root.style.setProperty('--color-1', `var(--${tint}-11)`);
};

window.onerror = message => app.error(message);
window.onunhandledrejection = event => app.error(event.reason);
