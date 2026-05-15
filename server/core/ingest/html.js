import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import normalizeUrl from 'normalize-url';
import { parseHTML } from 'linkedom';
import baseLog from '../log.js';

const log = baseLog.child({ module: 'ingest' });

const PROGRAM_KEYWORDS = [
	'function', 'const', 'let', 'var', 'return', 'import', 'export',
	'class', 'interface', 'public', 'private', 'void', 'null',
	'if', 'else', 'for', 'while', 'do', 'switch', 'case',
	'console.log', 'System.out', 'def ', 'end',
];

const JUNK_TAGS = [
	'script', 'style', 'iframe', 'link',
	'video', 'audio', 'svg', 'noscript',
	'canvas', 'template', 'object', 'embed',
	'form', 'input', 'button', 'select', 'textarea',
	'option', 'optgroup', 'label', 'fieldset', 'legend', 'datalist', 'output',
];

const turndown = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	hr: '---',
	bulletListMarker: '-',
});
turndown.use(gfm);
turndown.keep(['kbd', 'sup', 'sub']);

// Fallback to convert horizontal table to Markdown table format (with dummy header)
turndown.addRule('fallbackTable', {
	filter: node => node.nodeName === 'TABLE' && isHorizontalTable(node),
	replacement: (content, node) => {
		const maxCols = Math.max(0, ...Array.from(node.rows, r => r.cells.length));
		const header = '|' + ' |'.repeat(maxCols);
		const sep = '|' + '---|'.repeat(maxCols);
		return `\n\n${header}\n${sep}\n${content.trim()}\n\n`;
	},
});

turndown.addRule('fallbackTbody', {
	filter: node => ['TBODY', 'THEAD', 'TFOOT'].includes(node.nodeName) && isHorizontalTable(node),
	replacement: content => content,
});

turndown.addRule('fallbackTr', {
	filter: node => node.nodeName === 'TR' && isHorizontalTable(node),
	replacement: content => `| ${content.trim().replace(/\n+/g, ' ')} |\n`,
});

turndown.addRule('fallbackThTd', {
	filter: node => ['TH', 'TD'].includes(node.nodeName) && isHorizontalTable(node),
	replacement: (content, node) => {
		const txt = content.trim().replace(/\n+/g, ' ');
		const formatted = node.nodeName === 'TH' ? `**${txt}**` : txt;
		return node.nextElementSibling ? `${formatted} | ` : formatted;
	},
});

// Identify tables outside GFM plugin scope (e.g., Wikipedia Infobox)
function isHorizontalTable(node) {
	const table = node.closest('table');
	if (!table || table.rows.length === 0)
		return true;
	// Treat as horizontal table if any cell in first row is not 'TH'
	return Array.from(table.rows[0].cells).some(c => c.nodeName !== 'TH');
}

// Split multiple elements inside a link
turndown.addRule('smartLink', {
	filter: 'a',
	replacement: function (content, node) {
		const href = node.getAttribute('href');
		const title = node.title ? ` "${node.title}"` : '';
		const link = href ? `(${href}${title})` : '';

		if (!link)
			return content;

		// Keep simple link without newlines as is
		const trimmed = content.trim();
		if (!/\n/.test(trimmed))
			return `[${trimmed}]${link}`;

		// For huge link with newlines, redistribute link per line
		const lines = content.split('\n');
		const result = lines.map(line => {
			if (!line.trim())
				return line;

			// Heading (#### title) -> #### [title](url)
			const matchHeading = line.match(/^(#{1,6}\s+)(.+)$/);
			if (matchHeading)
				return `${matchHeading[1]}[${matchHeading[2]}]${link}`;

			// Image line (![alt](src)) -> [![alt](src)](url)
			// (Extract newline only and place around)
			if (/^!\[.*?\]\(.*?\)$/.test(line.trim()))
				return `[${line.trim()}]${link}`;

			// Other texts
			return `[${line}]${link}`;
		});

		return result.join('\n');
	},
});

function resolveURL(target, base, options) {
	try {
		const resolved = base ? new URL(target, base).href : new URL(target).href;
		return options ? normalizeUrl(resolved, options) : resolved;
	} catch (e) {
		return target;
	}
}

export function process(url, html) {
	const normalizeUrlOptions = {
		stripWWW: false,
		removeTrailingSlash: false,
		removeDirectoryIndex: false,
	};
	url = resolveURL(url, undefined, normalizeUrlOptions);

	html = html.replace(/<!--[\s\S]*?-->/g, '');

	const { document } = parseHTML(html);
	if (!document.documentElement) {
		log.warn({ url }, 'linkedom failed to parse document (documentElement is null)');
		return {
			html,
			markdown: generateMarkdown({ url, archiveUrl: null, title: '', content: '' }),
		};
	}

	// Remove Wayback Machine toolbar and other junk tags
	document.getElementById('wm-ipp-base')?.remove();
	document.getElementById('wm-ipp-print')?.remove();
	document.querySelectorAll(JUNK_TAGS.join(',')).forEach(el => el.remove());

	// Use <base> tag for URL resolution if present, then remove it to avoid confusing Readability.
	const baseEl = document.querySelector('base');
	baseEl?.remove();

	const baseURL = baseEl?.getAttribute('href') || url;
	const archiveUrl = (baseURL.includes('//web.archive.org/') && !url.includes('//web.archive.org/')) ? baseURL : null;

	// Merge paginated content to help Readability identify the full article
	document.querySelectorAll('[id^="uAutoPagerize-divider-"]').forEach(divider => {
		const prev = divider.previousElementSibling;
		const next = divider.nextElementSibling;
		if (prev && next) {
			prev.append(...next.childNodes);
			next.remove();
		}
		divider.remove();
	});
	document.getElementById('uAutoPagerize-insertPoint')?.remove();

	document.querySelectorAll('a').forEach(el => {
		const href = el.getAttribute('href');
		if (href)
			el.setAttribute('href', resolveURL(href, baseURL, normalizeUrlOptions));
	});
	document.querySelectorAll('img').forEach(el => {
		const src = el.getAttribute('src');
		if (src?.startsWith('data:'))
			return el.remove();

		if (src)
			el.setAttribute('src', resolveURL(src, baseURL, normalizeUrlOptions));
	});
	document.querySelectorAll('table caption').forEach(caption => {
		const table = caption.closest('table');
		if (table?.parentNode)
			table.insertAdjacentHTML('beforebegin', `<p><b>${caption.innerHTML}</b></p>`);

		caption.remove();
	});

	normalizeProgramPre(document);

	const page = {
		url,
		archiveUrl,
		description: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
	};

	if (!isProbablyReaderable(document)) {
		['header', 'footer', 'nav', 'aside'].forEach(tag => {
			document.querySelectorAll(tag).forEach(el => el.remove());
		});
	}

	let article;
	try {
		article = (new Readability(document)).parse();
	} catch (e) {
		// Handle rare crashes caused by malformed HTML structure in Readability.
		log.warn({ url, cause: e.message }, 'Readability failed to parse');
	}

	if (article) {
		page.title = article.title;
		page.siteName = article.siteName;
		page.content = turndown.turndown(article.content);
	} else {
		page.title = document.title;
		try {
			// Try converting entire body to Markdown
			page.content = turndown.turndown(document.body.innerHTML);
		} catch (e) {
			page.content = document.body.textContent || '';
		}
	}

	return {
		html: document.toString(),
		markdown: generateMarkdown(page),
	};
}

// Generate text in Markdown format
function generateMarkdown(page) {
	const frontmatter = [
		'---',
		page.title && `title: "${page.title.replace(/"/g, '\\"')}"`,
		page.siteName && `site: "${page.siteName.replace(/"/g, '\\"')}"`,
		page.url && `url: "${page.url}"`,
		page.archiveUrl && `archive: "${page.archiveUrl}"`,
		page.description && `description: "${page.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
		'---',
	].filter(Boolean).join('\n');

	return `${frontmatter}\n\n${page.content ? page.content.replace(/\n{3,}/g, '\n\n') : ''}`.trim();
}

// Normalize program-like pre element to fenced code block
function normalizeProgramPre(document) {
	Array.from(document.querySelectorAll('pre')).forEach(el => {
		const text = el.textContent || '';

		// Check for program keyword occurrences
		let keywordHit = 0;
		for (const kw of PROGRAM_KEYWORDS) {
			if (text.includes(kw))
				keywordHit++;
		}

		// Check for symbol occurrences (; { } ( ) = )
		const symbolMatch = (text.match(/[;\{\}\(\)=]/g) || []).length;
		const lines = text.split('\n').length;

		// Decision logic:
		// - Multiple keywords exist
		// - Or many symbols and multiple lines (code-block-like)
		// Skip otherwise
		if (!(!keywordHit >= 2 || (lines > 3 && symbolMatch > 3)))
			return;

		// Wrap in code if it's only pre without code
		if (!el.querySelector('code'))
			el.innerHTML = `<code>${el.innerHTML}</code>`;

		// Unwrap parent code element if it exists
		const parentCode = el.parentElement?.closest('code');
		if (parentCode)
			parentCode.replaceWith(...parentCode.childNodes);
	});
}
