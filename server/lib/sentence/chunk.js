import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';

export const chunkMarkdown = (md, {
	targetSize = 900, limitSize = 2000, overlapSize = 50,
} = {}) => {
	// パラグラフ内にあるURLを除去する
	md = md
		.replace(/\r\n?/g, '\n')
		.replace(/https?:\/\/[\w./\-?&=%#]+/g, '').trim();

	if (!md)
		return [];

	// CJK言語の場合チャンクサイズを半分にする
	if (/[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uff9f]/.test(md.slice(0, targetSize)))
		targetSize = Math.floor(targetSize / 2);
	const allowanceSize = targetSize * 1.4;

	// 構造的に分割する
	let chunks = [clean(engine.parse(md))];
	for (const test of tests) {
		chunks = chunks.flatMap(c => {
			c._text ??= engine.stringify(c);
			if (c._text.length <= targetSize)
				return c;
			return slice(c, test);
		});
	}

	// コードブロックとテーブルを分割する
	chunks = chunks.flatMap(c => {
		const header = c.children[0];
		if (header.type !== 'code')
			return c;

		// コードは限界まで長いチャンクにする
		return subChunk(header.value, limitSize).map(text => {
			return {
				type: 'root',
				children: [{ ...header, value: text }],
			};
		});
	});

	// タイトルを設定する
	const breadcrumb = [];
	chunks.forEach(c => {
		const header = c.children[0];
		const depth = header.depth;
		if (header.type === 'heading')
			breadcrumb.length = depth;

		header._titles = breadcrumb.filter(Boolean);

		if (header.type === 'heading')
			breadcrumb[depth] = engine.stringify(header).replace(/^#+\s*/, '').trim();

		if (header.type === 'yaml') {
			c._text = c._text.replace(/^(url:|readerable:).+?\n/gm, '');

			const match = c._text.match(/^title:\s*["']?(.*?)["']?\s*$/m);
			header.depth = 0;
			breadcrumb[0] = match ? match[1].trim() : '';
		}
	});

	// Markdownテキストを決定する
	chunks = chunks.map(c => {
		const header = c.children[0];
		if (header.type === 'yaml')
			return;

		return {
			position: header.position.start,
			depth: header.depth != null ? header.depth : 999,
			titles: header._titles || [],
			text: c._text || engine.stringify(c).trim(),
			isCode: header.type === 'code',
			isHeader: header.type === 'heading',
			isTable: header.type === 'table',
		};
	}).filter(Boolean);

	// 大きすぎるチャンクを機械的に分割する
	chunks = chunks.flatMap(c => {
		if (c.text.length <= targetSize || c.isCode)
			return c;

		return subChunk(c.text, c.isTable ? limitSize : allowanceSize).map((text, subIndex) => ({
			...c,
			text,
			subIndex,
		}));
	});

	// ゴミを除去する
	chunks.forEach((c, i) => {
		if (c.isCode)
			return;

		c.text = c.text
			.replace(/^\|[\| \-\t:]+$/gm, '')
			.replace(/\n\n+/g, '\n\n')
			.trim();
	});

	// フラグメントを統合する
	const minSize = targetSize / 3;
	for (let i = 0; i < chunks.length; i++) {
		const self = chunks[i];
		if (self.text.length >= minSize)
			continue;

		// 後続より同等か上位の見出しなら後続を取り込む
		const prev = chunks[i - 1];
		const next = chunks[i + 1];
		if (next && (self.text.length + next.text.length) < allowanceSize && self.isHeader && self.depth <= next.depth) {
			chunks.splice(i + 1, 1);
			self.text += '\n\n' + next.text;
			i--;// 結合した後のチャンクを再チェック
		} else if (prev && (self.text.length + prev.text.length) < allowanceSize) {
			chunks.splice(i, 1);
			prev.text += '\n\n' + self.text;
			i -= 2; // 結合した前のチャンクを再チェック
		}
	}

	// 残存フラグメントを強制統合する
	for (let i = 1; i < chunks.length; i++) {
		const self = chunks[i];
		if (self.text.length >= minSize)
			continue;

		const prev = chunks[i - 1];
		chunks.splice(i, 1);
		prev.text += '\n\n' + self.text;
		i -= 1;
	}

	// オーバーラップ
	chunks = chunks.map((c, i) => {
		if (i === 0 || c.depth < 999 || c.isCode || c.isTable)
			return c;

		const tail = chunks[i - 1].text.slice(-overlapSize)
			.replace(/^(.*?\n|.*?[ ,\.])/m, '').trim();
		return {
			...c,
			text: tail + '\n\n' + c.text,
		};
	});

	return chunks;
};

const engine = unified()
	.use(remarkParse)
	.use(remarkFrontmatter)
	.use(remarkGfm, {
		tablePipeAlign: false,
		tableCellPadding: false,
	})
	.use(remarkStringify, {
		bullet: '-',
		fences: true,
		listItemIndent: 'one',
		handlers: {
			break: () => '\n',
		},
	});

const tests = [
	{ test: n => n.type === 'yaml', splitAfter: true },
	{ test: n => n.type === 'heading' && n.depth === 1 },
	{ test: n => n.type === 'heading' && n.depth === 2 },
	{ test: n => n.type === 'heading' && n.depth === 3 },
	{ test: n => n.type === 'heading' && n.depth === 4 },
	{ test: n => n.type === 'heading' && n.depth === 5 },
	{ test: n => n.type === 'thematicBreak', splitAfter: true },
	{ test: n => n.type === 'paragraph' && n.children[0].type === 'strong' },
	{ test: n => n.type === 'code', splitAfter: true },
	{ test: n => n.type === 'table', splitAfter: true },
	{ test: n => n.type === 'list', splitAfter: true },
	{ test: n => n.type === 'listItem' },
	{ test: n => n.type === 'paragraph' },
];

// 構造的にノードを分割する
const slice = (tree, test) => {
	const chunks = [];
	let current = [];
	const flush = () => {
		if (current.length > 0)
			chunks.push({ type: 'root', children: current });
		current = [];
	};

	tree.children.forEach(node => {
		if (test.test(node)) {
			flush();
			current.push(node);
			if (test.splitAfter)
				flush();
		} else {
			current.push(node);
		}
	});
	flush();

	// 分割されなかった場合 キャッシュを活かすため元のノードを返す
	return chunks.length === 1 ? [tree] : chunks;
};

const clean = node => {
	node.children = node.children ? node.children.flatMap(clean) : [];
	if ((node.type === 'paragraph' || node.type === 'link' || node.type === 'html') && !node.children.length)
		return [];

	if (node.type === 'image')
		return node.alt ? { type: 'text', value: node.alt } : [];

	if (node.url)
		node.url = '';

	return node;
};

const subTests = [
	t => t.match(/.*?\n|.+/gs) || [],
	t => t.match(/.*?(?:[。．！？]\s*|[!?.](?:\s+|$))|.+/gs) || [],
	t => t.match(/.*?(?:[、，]\s*|,(?:\s+|$))|.+/gs) || [],
	// t => Array.from(t), // 価値が低いデータを切り捨てる
];

export const split = text => {
	let chunks = [{ text, position: 0 }];
	for (const test of subTests.slice(0, 2)) {
		chunks = chunks.flatMap(c => {
			let currentOffset = c.position;
			return test(c.text).map(p => {
				const chunk = { text: p, position: currentOffset };
				currentOffset += p.length;
				return chunk;
			});
		});
	}
	// 記号だけのチャンクを除去する
	return chunks.filter(c => /[\p{L}\p{N}]/u.test(c.text));
};

const subChunk = (text, limitSize, i = 0) => {
	const test = subTests[i];
	if (!test || text.length <= limitSize)
		return [text];

	return bundle(text, test, limitSize)
		.flatMap(p => subChunk(p, limitSize, i + 1));
};

// 長い文字列を分割し適切な長さ毎にまとめる
const bundle = (text, splitFn, limitSize) => {
	const parts = splitFn(text);
	if (parts.length <= 1)
		return [text];

	const numChunks = Math.ceil(text.length / limitSize);
	const idealSize = Math.floor(text.length / numChunks) * 0.9;

	const segments = [];
	let current = '';
	for (const p of parts) {
		if (current.length > 0 && (current + p).length > idealSize) {
			segments.push(current);
			current = p;
		} else {
			current += p;
		}
	}
	if (current)
		segments.push(current);
	return segments;
};
