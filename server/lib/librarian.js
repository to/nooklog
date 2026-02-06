import { Readability, isProbablyReaderable } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

const PROGRAM_KEYWORDS = [
	'function', 'const', 'let', 'var', 'return', 'import', 'export',
	'class', 'interface', 'public', 'private', 'void', 'null',
	'if', 'else', 'for', 'while', 'do', 'switch', 'case',
	'console.log', 'System.out', 'def ', 'end',
];

const JUNK_TAGS = [
	'script', 'style', 'iframe', 'link',
	'img', 'video', 'audio', 'svg', 'noscript',
	'canvas', 'picture', 'source', 'template', 'object', 'embed',
	'header', 'footer', 'nav', 'aside',
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
}).addRule('linkRemover', {
	filter: 'a',
	replacement: function (content) {
		return content;
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
		page.excerpt = article.excerpt;
		page.content = turndownService.turndown(article.content);
	} else {
		page.title = document.title;
		try {
			// body全体をMarkdownに変換してみる(空文字列であることが多い)
			page.content = turndownService.turndown(document.body.innerHTML);
		} catch (e) {
			console.warn(`Turndown failed in fallback, using textContent: ${e.message}`);
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
	// メタデータを含めた出力テキストを作成
	const lines = [];
	if (page.title)
		lines.push(`# ${page.title}`);

	if (page.siteName)
		lines.push(`- SiteName: ${page.siteName}`);

	// Readabilityの判定結果をメモ（デバッグ用にも便利）
	if (page.readerable)
		lines.push(`- Readerable: ${page.readerable}`);

	if (page.description)
		lines.push('', '## Description', page.description);

	if (page.excerpt && page.excerpt !== page.description)
		lines.push('', '## Excerpt', page.excerpt);

	// 3連続以上の改行を2つに圧縮
	if (page.content) {
		lines.push('', '## Content',
			page.content.replace(/\n{3,}/g, '\n\n'));
	}

	return lines.join('\n');
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
