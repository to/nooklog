module.exports = {
	apps: [{
		name: 'nooklog',
		script: 'server/server.js',
		// punycode(express-asset-file-cache-middleware)の警告を抑制
		node_args: ['--no-deprecation'],
		watch: false,
		// エラー時に自動再起動する設定
		autorestart: true,
		ignore_watch: [
			'node_modules',
			'data',
			'.git',
			'public/dump.html',
			'work',
			'logs',
		],
		// ログ出力先の設定
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		env: {
			NODE_ENV: 'development',
		},
		// メモリ使用量が一定を超えたら再起動（念のため）
		max_memory_restart: '1G',
	}],
};
