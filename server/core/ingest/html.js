import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import normalizeUrl from 'normalize-url';
import { parseHTML } from 'linkedom';
import { Defuddle } from 'defuddle/node';
import baseLog from '../log.js';
import config from '../config.js';
import _ from '../util.js';

const log = baseLog.child({ module: 'ingest' });

const PROGRAM_KEYWORDS = [
	'function', 'const', 'let', 'var', 'return', 'import', 'export',
	'class', 'interface', 'public', 'private', 'void', 'null',
	'if', 'else', 'for', 'while', 'do', 'switch', 'case',
	'console.log', 'System.out', 'def ', 'end',
];

const JUNK_TAGS = [
	'script', 'style', 'link',
	'video', 'audio', 'svg', 'noscript',
	'canvas', 'template', 'object', 'embed',
	'form', 'input', 'button', 'select', 'textarea',
	'option', 'optgroup', 'label', 'fieldset', 'legend', 'datalist', 'output',
];

const ALLOWED_IFRAME_DOMAINS = [
	'youtube.com',
	'youtube-nocookie.com',
	'youtu.be',
	'player.vimeo.com',
	'google.com/maps',
	'slideshare.net',
	'speakerdeck.com',
	'giphy.com',
	'codepen.io',
	'jsfiddle.net',
	'open.spotify.com',
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
	filter: node => node.nodeName === 'A',
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

export async function process(url, html) {

	return config['ingest.extractor'] === 'defuddle'
		? processByDefuddle(url, html)
		: processByReadability(url, html);
}

export async function processByDefuddle(url, html) {
	const result = await Defuddle(html, url, { markdown: true });
	return {
		html,
		markdown: generateMarkdown({ url, siteName: result.site, ...result }),
		metadata: result,
	};
}

export async function processByReadability(url, html) {
	url = resolveURL(url);
	html = html.replace(/<!--[\s\S]*?-->/g, '');

	const { document } = parseHTML(html);
	if (document.documentElement) {
		document.getElementById('wm-ipp-base')?.remove();
		document.getElementById('wm-ipp-print')?.remove();
		document.querySelectorAll(JUNK_TAGS.join(',')).forEach(el => el.remove());
		html = document.toString();
	}

	if (!document.documentElement) {
		log.debug({ url }, 'linkedom failed to parse document (documentElement is null)');
		return {
			html,
			markdown: generateMarkdown({ url }),
		};
	}

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
			el.setAttribute('href', resolveURL(href, baseURL));
	});

	document.querySelectorAll('img').forEach(el => {
		const src = el.getAttribute('src');
		if (src?.startsWith('data:'))
			return el.remove();

		if (src)
			el.setAttribute('src', resolveURL(src, baseURL));
	});

	document.querySelectorAll('table caption').forEach(caption => {
		const table = caption.closest('table');
		if (table?.parentNode)
			table.insertAdjacentHTML('beforebegin', `<p><b>${caption.innerHTML}</b></p>`);

		caption.remove();
	});

	['code-toolbar'].forEach(cls => {
		document.querySelectorAll(`.${cls}`).forEach(el => el.classList.remove(cls));
	});

	normalizeProgramPre(document);

	// Replace allowed iframes with text placeholders to bypass Readability stripping
	document.querySelectorAll('iframe').forEach(el => {
		const src = el.getAttribute('src');
		if (src && isAllowedIframe(src))
			el.replaceWith(document.createTextNode(`[iframe:${src}]`));
	});

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

	// Save fallback values before Readability mutates the document
	page.title = document.title;
	page.content = document.body.textContent || '';

	try {
		const article = new Readability(document).parse();
		if (article != null) {
			page.title = article.title || page.title;
			page.siteName = article.siteName || '';
			page.content = turndown.turndown(article.content);
		} else {
			throw { message: 'Readability could not parse the document' };
		}
	} catch (e) {
		log.debug({ url, cause: e.message }, 'HTML parsing fallback triggered');
		try {
			return {
				html,
				markdown: (await processByDefuddle(url, html)).markdown,
			};
		} catch (err) {
			// Keep the pre-saved textContent in page.content
			log.debug({ url, cause: err.message }, 'HTML defuddle fallback failed');
		}
	}

	return {
		html,
		markdown: generateMarkdown(page),
	};
}

function resolveURL(target, base) {
	try {
		const resolved = base ? new URL(target, base).href : new URL(target).href;
		return normalizeUrl(resolved, {
			stripWWW: false,
			removeTrailingSlash: false,
			removeDirectoryIndex: false,
		});
	} catch (e) {
		return target;
	}
}

function isAllowedIframe(src) {
	try {
		const url = new URL(src);
		return ALLOWED_IFRAME_DOMAINS.some(domain => url.hostname.includes(domain));
	} catch (e) {
		return false;
	}
}

// Generate text in Markdown format
function generateMarkdown(page) {
	const frontmatter = [
		'---',
		page.title && `title: "${page.title.replace(/"/g, '\\"')}"`,
		page.siteName && `site: "${page.siteName.replace(/"/g, '\\"')}"`,
		page.url && `source: "${page.url}"`,
		page.archiveUrl && `archive: "${page.archiveUrl}"`,
		page.author && `author: "${page.author.replace(/"/g, '\\"')}"`,
		page.published && `published: "${page.published}"`,
		page.language && `language: "${page.language}"`,
		page.description && `description: "${page.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
		'---',
	].filter(Boolean).join('\n');

	let body = (page.content || '')
		.replace(/^(\s*-\s)\s+/gm, '$1')
		.replace(/(```[a-zA-Z0-9-]*)\n\n+/g, '$1\n')
		.replace(/\n{3,}/g, '\n\n');
	body = body.replace(/\\?\[iframe:(.*?)\\?\]/g, (match, url) => {
		const cleanUrl = url.replace(/\\/g, '');
		return `<iframe src="${cleanUrl}"></iframe>`;
	});
	return `${frontmatter}\n\n${body}`.trim();
}

// Normalize program-like pre element to fenced code block
function normalizeProgramPre(document) {
	Array.from(document.querySelectorAll('pre')).forEach(el => {
		const text = el.textContent || '';

		// Check for program keyword occurrences
		const keywordHit = PROGRAM_KEYWORDS.filter(kw => text.includes(kw)).length;

		// Check for symbol occurrences (; { } ( ) = )
		const symbolMatch = (text.match(/[;\{\}\(\)=]/g) || []).length;
		const lines = text.split('\n').length;

		// Decision logic:
		// - Multiple keywords exist
		// - Or many symbols and multiple lines (code-block-like)
		// Skip if neither condition matches (fails to look like code)
		if (keywordHit < 2 && !(lines > 3 && symbolMatch > 3))
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

export function isLogin(html, title, originalTitle) {
	const hasPassword = html.includes('type="password"');
	const isTitleDifferent = originalTitle && !_.isSimilarText(originalTitle, title);
	const isLoginTitle = /log\s?in|sign\s?in|ログイン|サインイン/i.test(title || '');

	return hasPassword && (isTitleDifferent || isLoginTitle);
}
