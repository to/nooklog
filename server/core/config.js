export default {
	'client.theme': 'system', // 'light', 'dark', 'system'
	'client.tint': 'grass', // 'red', 'pink', etc.
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
	'sentence.provider': 'none', // 'llama', 'transformers', 'openai', 'none'
	'sentence.device': 'auto',
	'sentence.queryPrefix': '', // 空文字ならプリセットを使用
	'sentence.documentTitlePrefix': '', // 空文字ならプリセットを使用
	'sentence.documentTextPrefix': '', // 空文字ならプリセットを使用
	'sentence.llama.model': 'hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf',
	'sentence.transformers.model': 'onnx-community/embeddinggemma-300m-ONNX',
	'sentence.transformers.dtype': 'q8',
	'sentence.openai.model': 'embeddinggemma',
	'sentence.openai.url': 'http://localhost:11434/v1/embeddings',
	'sentence.openai.apiKey': '',
	'sentence.contextSize': 2048,
	'database.searchLimit': 300,
	'database.tokenizer': 'word', // 'word', 'unigram'
	'database.saveHTML': false,
	'database.turso.replica': false,
};
