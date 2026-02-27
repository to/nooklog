module.exports = {
	apps: [{
		name: 'nookmark',
		script: 'server/server.js',
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
