import * as chunk from './chunk.js';
import vector from './vector.js';

// 日本語表記揺れの正規化
const normalizeJp = text => (text || '')
	.normalize('NFKC')
	.replace(/([ァ-ヶー]{2,})ー$/g, '$1');

// 1文字 Uni-gram 分割
const segment = text => [...normalizeJp(text)]
	.join(' ')
	.replace(/\s+/g, ' ')
	.trim();

// URL専用セグメント (プロトコルのみ除去し、記号は保持してUni-gram化)
const segmentUrl = url => segment((url || '')
	.replace(/^https?:\/\//, '')
	.toLowerCase());

// Markdown専用セグメント (記号やURLを物理的に除去するのではなく、スペースに置換してインデックスの重なりを抑制)
const segmentMarkdown = text => segment((text || '')
	.replace(/https?:\/\/[^\s]+/g, ' ') // URL自体はurlカラムにあるので除去
	.replace(/[#*`_~[\]()>+-]/g, ' ')); // 装飾記号をスペースへ

export default {
	normalizeJp,
	segment,
	segmentUrl,
	segmentMarkdown,
	...chunk,
	...vector,
};
