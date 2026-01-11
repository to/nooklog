module.exports = {
	apps: [{
		name: 'nookmark',
		script: 'server.js',
		watch: true,
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
		log_date_format: 'YYYY-MM-DD HH:mm:ss',
		env: {
			NODE_ENV: 'development',
		},
		// エラー時に自動再起動する設定
		autorestart: true,
		// メモリ使用量が一定を超えたら再起動（念のため）
		max_memory_restart: '1G',
	}],
};
