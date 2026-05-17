module.exports = {
	apps: [{
		name: 'nooklog',
		script: 'server/server.js',
		node_args: '--expose-gc',
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
		// Setting the log output destination
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		env: {
			NODE_ENV: 'development',
		},
		shutdown_with_message: true, // Receive shutdown
		restart_delay: 500, // Auto restart interval
		kill_timeout: 5000, // Time to wait for graceful shutdown
		listen_timeout: 10000, // Time until considered normally started
	}],
};
