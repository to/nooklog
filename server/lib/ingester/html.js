import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import normalizeUrl from 'normalize-url';
import { JSDOM } from 'jsdom';
import baseLogger from '../logger.js';

const logger = baseLogger.child({ module: 'librarian' });

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

const JUNK_REGEX_TAG =
	new RegExp(`<(${JUNK_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
const JUNK_REGEX_OPEN =
	new RegExp(`<(${JUNK_TAGS.join('|')})\\b[^>]*>`, 'gi');

const turndown = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	hr: '---',
	bulletListMarker: '-',
});
turndown.use(gfm);
turndown.keep(['kbd', 'sup', 'sub']);

// 横方向テーブルをMarkdownのテーブル形式（ダミーヘッダ付き）に変換するフォールバック
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

// GFMプラグインの対象外となるテーブル（主にWikipediaのInfoboxなど）を判定
function isHorizontalTable(node) {
	const table = node.closest('table');
	if (!table || table.rows.length === 0)
		return true;
	// 最初の行のセルの中に1つでも 'TH' 以外があれば横方向テーブル（GFMテーブルではない）とみなす
	return Array.from(table.rows[0].cells).some(c => c.nodeName !== 'TH');
}

// リンクの中に含まれる複数の要素を分割する
turndown.addRule('smartLink', {
	filter: 'a',
	replacement: function (content, node) {
		const href = node.getAttribute('href');
		const title = node.title ? ` "${node.title}"` : '';
		const link = href ? `(${href}${title})` : '';

		if (!link)
			return content;

		// 改行を持たないシンプルなリンクはそのまま
		const trimmed = content.trim();
		if (!/\n/.test(trimmed))
			return `[${trimmed}]${link}`;

		// 改行を含む巨大なリンクの場合、行ごとにリンクを再配分する
		const lines = content.split('\n');
		const result = lines.map(line => {
			if (!line.trim())
				return line;

			// 見出し (#### title) -> #### [title](url)
			const matchHeading = line.match(/^(#{1,6}\s+)(.+)$/);
			if (matchHeading)
				return `${matchHeading[1]}[${matchHeading[2]}]${link}`;

			// 画像の行 (![alt](src)) -> [![alt](src)](url)
			// (改行だけ取り出して前後に付ける)
			if (/^!\[.*?\]\(.*?\)$/.test(line.trim()))
				return `[${line.trim()}]${link}`;

			// それ以外のテキスト
			return `[${line}]${link}`;
		});

		return result.join('\n');
	},
});

export function process(url, title, html) {
	const cleanUrl = normalizeUrl(url, {
		stripHash: true,
	});

	let cleanHtml = html
		.replace(JUNK_REGEX_TAG, '')
		.replace(JUNK_REGEX_OPEN, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	const document = (new JSDOM(cleanHtml, { url: cleanUrl })).window.document;

	document.querySelectorAll('a').forEach(el => {
		try {
			el.setAttribute('href', normalizeUrl(el.href, { stripHash: true }));
		} catch (e) {
			el.removeAttribute('href');
		}
	});
	document.querySelectorAll('img').forEach(el => el.setAttribute('src', el.src));

	// 抽出時に欠落しやすい、またはテーブル内のMarkdown変換規則(プラグイン)でおかしくなりやすいcaptionを、独立したパラグラフとして抽出する
	document.querySelectorAll('table caption').forEach(caption => {
		const table = caption.closest('table');
		if (table?.parentNode)
			table.insertAdjacentHTML('beforebegin', `<p><b>${caption.innerHTML}</b></p>`);

		caption.remove();
	});

	normalizeProgramPre(document);

	const page = {
		url: cleanUrl,
		readerable: isProbablyReaderable(document),
		description: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
	};

	if (!page.readerable) {
		['header', 'footer', 'nav', 'aside'].forEach(tag => {
			document.querySelectorAll(tag).forEach(el => el.remove());
		});
	}

	const article = (new Readability(document)).parse();
	if (article) {
		page.title = article.title;
		page.siteName = article.siteName;
		page.content = turndown.turndown(article.content);
	} else {
		page.title = document.title;
		try {
			// body全体をMarkdownに変換してみる
			page.content = turndown.turndown(document.body.innerHTML);
		} catch (e) {
			page.content = document.body.textContent || '';
		}
	}

	// ユーザー指定のタイトルを最優先する
	page.title = title || page.title || '';
	return {
		title: page.title,
		html: cleanHtml,
		markdown: generateMarkdown(page),
	};
}

// Markdown形式のテキストを生成する
function generateMarkdown(page) {
	const frontmatter = [
		'---',
		page.title && `title: "${page.title.replace(/"/g, '\\"')}"`,
		page.siteName && `site: "${page.siteName.replace(/"/g, '\\"')}"`,
		page.url && `url: "${page.url}"`,
		page.readerable && `readerable: ${page.readerable}`,
		page.description && `description: "${page.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
		'---',
	].filter(Boolean).join('\n');

	return `${frontmatter}\n\n${page.content ? page.content.replace(/\n{3,}/g, '\n\n') : ''}`.trim();
}

// プログラムっぽいpre要素をフェンスド・コードブロックに正規化する
function normalizeProgramPre(document) {
	Array.from(document.querySelectorAll('pre')).forEach(el => {
		const text = el.textContent || '';

		// プログラムキーワードの含有チェック
		let keywordHit = 0;
		for (const kw of PROGRAM_KEYWORDS) {
			if (text.includes(kw))
				keywordHit++;
		}

		// 記号の含有チェック (; { } ( ) = )
		const symbolMatch = (text.match(/[;\{\}\(\)=]/g) || []).length;
		const lines = text.split('\n').length;

		// 判定ロジック:
		// - キーワードが複数個ある
		// - または、記号がたくさんあって複数行(コードブロックっぽい)
		// そうでなければスキップ(処理しない)
		if (!(!keywordHit >= 2 || (lines > 3 && symbolMatch > 3)))
			return;

		// preだけでcodeがない場合、codeでラップする
		if (!el.querySelector('code'))
			el.innerHTML = `<code>${el.innerHTML}</code>`;

		// 親要素にcodeタグが存在する場合、親のcode要素をアンラップする
		const parentCode = el.parentElement?.closest('code');
		if (parentCode)
			parentCode.replaceWith(...parentCode.childNodes);
	});
}
