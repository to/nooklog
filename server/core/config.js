const config = {
	'client.theme': 'system', // 'light', 'dark', 'system'
	'client.tint': 'cyan', // 'red', 'pink', etc.
	'client.windowPosition': 'bottom-right', // 'top-right', 'bottom-right'
	'client.tagMatchMode': 'smart', // 'smart'（飛び石）, 'contains'（部分一致）, 'starts-with'（前方一致）
	'client.ratingInputMode': 'both', // 'stars', 'tags', 'both'
	'client.autoCompleteTags': false, // 充分に絞られたら自動確定するかどうか
	'client.normalizeFullWidth': false, // 全角の（）や／を半角に自動変換するか
	'extension.serverAddress': 'http://localhost:5050',
	'extension.selectionDelimiter': '/',
	'extension.autoAppendSelection': true,
	'extension.openSearchInForeground': true,
	'extension.focusMemoOnSelection': false,
	'server.port': 5050,
	'server.password': '',
	'sentence.vector.provider': 'none', // 'llama', 'transformers', 'openai', 'none'
	'sentence.vector.device': 'auto',
	'sentence.vector.queryPrefix': '', // 空文字ならプリセットを使用
	'sentence.vector.documentTitlePrefix': '', // 空文字ならプリセットを使用
	'sentence.vector.documentTextPrefix': '', // 空文字ならプリセットを使用
	'sentence.vector.llama.model': 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf',
	'sentence.vector.transformers.model': 'onnx-community/embeddinggemma-300m-ONNX',
	'sentence.vector.transformers.dtype': 'q8',
	'sentence.vector.openai.model': 'embeddinggemma',
	'sentence.vector.openai.url': 'http://localhost:11434/v1/embeddings',
	'sentence.vector.openai.apiKey': '',
	'sentence.vector.contextSize': 2048,
	'database.searchLimit': 300,
	'database.tokenizer': 'word', // 'word', 'unigram'
	'database.saveHTML': false,
	'database.turso.replica': false,
};

Object.defineProperty(config, 'sentence.vector.disabled', {
	enumerable: false,
	configurable: true,
	get() {
		// 低メモリ環境を考慮し埋め込みの利用を判断する
		return this['sentence.vector.provider'] === 'none' || (
			this['sentence.vector.provider'] === 'openai'
				? false
				: !!this['server.readonly']);
	},
	set() { },
});

export default config;
