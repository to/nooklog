module.exports = {
	apps: [{
		name: 'nooklog',
		script: 'server/server.js',
		// punycode(express-asset-file-cache-middleware)の警告を抑制
		node_args: ['--no-deprecation'],
		watch: false,
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
		// ネイティブモジュール(llama.cppなど)やバッチジョブチャンクの終了を待つ
		kill_timeout: 5000,
		shutdown_with_message: true, // 終了を受診する
		restart_delay: 500, // 自動再起動の間隔
		listen_timeout: 10000, // 正常起動とみなされるまでの時間
	}],
};
