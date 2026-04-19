import config from '../config.js';

let chunk = {};
if (!config['server.readonly'])
	chunk = await import('./chunk.js');

import vector from './vector.js';

// Normalize Japanese orthographical variants (Wide space/Alphanumeric to half-width, combined voiced marks, etc.)
const normalizeJp = text => (text || '')
	.normalize('NFKC')
	.replace(/([ァ-ヶー]{2,})ー$/g, '$1');

// Uni-gram splitting
const segment = text => [...normalizeJp(text)]
	.join(' ')
	.replace(/\s+/g, ' ')
	.trim();

// URL specific normalization (remove protocol and lowercase)
const cleanUrl = url => (url || '')
	.replace(/^https?:\/\//, '')
	.toLowerCase();

// URL specific segment (Uni-gram)
const segmentUrl = url => segment(cleanUrl(url));

// Markdown specific normalization (replace symbols and URLs with space)
const cleanMarkdown = text => (text || '')
	.replace(/https?:\/\/[^\s]+/g, ' ') // Remove URLs as they exist in url column
	.replace(/[#*`_~[\]()>+-]/g, ' '); // Convert markup symbols to spaces

// Markdown specific segment (Uni-gram)
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
