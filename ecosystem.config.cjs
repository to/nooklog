module.exports = {
	apps: [{
		name: 'nooklog',
		script: 'server/server.js',
		// Suppress punycode (express-asset-file-cache-middleware) warnings
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
		// Setting the log output destination
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		env: {
			NODE_ENV: 'development',
		},
		// Wait for the termination of native modules (e.g. llama.cpp) and batch job chunks
		kill_timeout: 5000,
		shutdown_with_message: true, // Receive shutdown
		restart_delay: 500, // Auto restart interval
		listen_timeout: 10000, // Time until considered normally started
	}],
};
