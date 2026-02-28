import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import baseLogger from './logger.js';

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

const turndownService = new TurndownService({
	headingStyle: 'atx',
	codeBlockStyle: 'fenced',
	hr: '---',
	bulletListMarker: '-',
}).addRule('smartLink', {
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
			return `[${content}]${link}`;

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

export function processHtml(url, title, html) {
	let cleanHtml = html
		.replace(JUNK_REGEX_TAG, '')
		.replace(JUNK_REGEX_OPEN, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	const document = (new JSDOM(cleanHtml, { url })).window.document;
	normalizeProgramPre(document);

	const page = {
		readerable: isProbablyReaderable(document),
		description: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
	};

	const article = (new Readability(document)).parse();
	if (article) {
		page.title = article.title;
		page.siteName = article.siteName;
		page.content = turndownService.turndown(article.content);
	} else {
		page.title = document.title;
		try {
			// body全体をMarkdownに変換してみる(空文字列であることが多い)
			page.content = turndownService.turndown(document.body.innerHTML);
		} catch (e) {
			logger.warn({ error: e }, 'turndown fallback triggered');
			page.content = document.body.textContent || '';
		}
	}

	// ユーザー指定のタイトルを最優先する
	page.title = title || page.title || '';
	return {
		title: page.title,
		cleanHtml: cleanHtml,
		markdown: generateMarkdown(page),
	};
}

// Markdown形式のテキストを生成する
function generateMarkdown(page) {
	const frontmatter = [
		'---',
		page.title && `title: "${page.title.replace(/"/g, '\\"')}"`,
		page.siteName && `siteName: "${page.siteName.replace(/"/g, '\\"')}"`,
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
