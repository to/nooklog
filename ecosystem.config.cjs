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
		shutdown_with_message: true, // 終了を受診する
		kill_timeout: 3000, // ネイティブモジュール(llama.cppなど)の終了を待つ
		restart_delay: 500, // 自動再起動の間隔
		listen_timeout: 10000, // 正常起動とみなされるまでの時間
	}],
};
