import config from '../config.js';

let chunk = {};
if (!config['server.readonly'])
	chunk = await import('./chunk.js');

import vector from './vector.js';

// 日本語表記揺れの正規化 (全角空白/英数→半角、分離された濁点→合成など)
const normalizeJp = text => (text || '')
	.normalize('NFKC')
	.replace(/([ァ-ヶー]{2,})ー$/g, '$1');

// 1文字 Uni-gram 分割
const segment = text => [...normalizeJp(text)]
	.join(' ')
	.replace(/\s+/g, ' ')
	.trim();

// URL専用正規化 (プロトコルのみ除去して小文字化)
const cleanUrl = url => (url || '')
	.replace(/^https?:\/\//, '')
	.toLowerCase();

// URL専用セグメント (Uni-gram化)
const segmentUrl = url => segment(cleanUrl(url));

// Markdown専用正規化 (記号やURLをスペースに置換)
const cleanMarkdown = text => (text || '')
	.replace(/https?:\/\/[^\s]+/g, ' ') // URL自体はurlカラムにあるので除去
	.replace(/[#*`_~[\]()>+-]/g, ' '); // 装飾記号をスペースへ

// Markdown専用セグメント (Uni-gram化)
const segmentMarkdown = text => segment(cleanMarkdown(text));

export default {
	normalizeJp,
	cleanUrl,
	cleanMarkdown,
	segment,
	segmentUrl,
	segmentMarkdown,
	...chunk,
	...vector,
};
