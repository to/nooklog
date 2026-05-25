import _ from '../util.js';
import ky from 'ky';

import baseLog from '../log.js';
const log = baseLog.child({ module: 'ingest' });

let browser;
let playwrightChromium;
let fetchCount = 0;

const MAX_FETCH_COUNT = 50;

async function newContext(options = {}) {
	if (!playwrightChromium) {
		const [{ chromium }, { default: stealth }] = await Promise.all([
			import('playwright-extra'),
			import('puppeteer-extra-plugin-stealth'),
		]);
		chromium.use(stealth());
		playwrightChromium = chromium;
	}

	fetchCount++;

	if (fetchCount % MAX_FETCH_COUNT === 0) {
		log.debug({ fetchCount }, 'restarting browser to release memory');
		await dispose();

		const { rss, heapUsed } = process.memoryUsage();
		log.debug({
			fetchCount,
			rss: `${Math.floor(rss / 1024 / 1024)}MB`,
			heap: `${Math.floor(heapUsed / 1024 / 1024)}MB`,
		}, 'memory footprint');
	}

	if (!browser || !browser.isConnected()) {
		// Launch browser directly instead of using launchServer + connect
		// to reduce WebSocket communication overhead in Node.js RSS
		browser = await playwrightChromium.launch({
			args: [
				'--disable-gpu',
				'--disable-dev-shm-usage',
				'--ssl-version-min=tls1',
				'--ignore-certificate-errors',
				'--disable-blink-features=AutomationControlled',
				'--blink-settings=imagesEnabled=false',
				'--disable-extensions',
				'--disable-background-networking',
				'--disable-site-isolation-trials',
				'--disable-sync',
				'--disable-default-apps',
				'--mute-audio',
			],
			ignoreDefaultArgs: [
				'--enable-automation',
			],
			handleSIGINT: false,
			handleSIGTERM: false,
			handleSIGHUP: false,
		});
	}

	return await browser.newContext({
		ignoreHTTPSErrors: true,
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
		viewport: { width: 1280, height: 800 },
		serviceWorkers: 'block',
		...options,
	});
}

export async function dispose() {
	if (browser) {
		await _.cutOff(browser.close(), 5000);
		browser = null;
	}

	if (global.gc) {
		// Force GC to reclaim native memory associated with JS objects
		const before = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
		global.gc();
		const after = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);
		log.debug({ reclaimed: `${before - after}MB`, heap: `${after}MB` }, 'gc complete');
	}
}

export async function fetch(url) {
	const isArchive = url.includes('//web.archive.org/');
	const MAX_ATTEMPTS = isArchive ? 3 : 2;

	let attempts = 0;
	while (attempts++ < MAX_ATTEMPTS) {
		if (attempts > 1)
			await _.wait(3 * 1000);

		const context = await newContext();
		const page = await context.newPage();
		try {
			await setupCapture(page);

			const response = await page.goto(url, {
				waitUntil: 'domcontentloaded',
				timeout: isArchive ? 40000 : 10000,
			});

			if (!response.ok()) {
				const error = new Error(`HTTP ${response.status()}`);
				error.status = response.status();
				throw error;
			}

			await page.waitForTimeout(1500);

			return {
				url: response.url(),
				title: await page.title(),
				html: await page.html(),
			};
		} catch (e) {
			normalizeError(e, isArchive);

			if (attempts < MAX_ATTEMPTS && e.isRetryable) {
				log.debug({ attempt: attempts, cause: e.message, url }, 'fetch retrying');
				continue;
			}

			if (e.isTransient)
				throw e;

			if (!isArchive) {
				log.debug({ cause: e.message, url }, 'fetch failed');

				let archiveUrl;
				try {
					archiveUrl = await resolveArchiveUrl(url);
					if (archiveUrl) {
						const res = await fetch(archiveUrl);
						log.debug({ url: res.url }, 'archive fetch success');
						res.html = `<base href="${res.url}">\n${res.html}`;
						return res;
					} else {
						log.debug('archive not available');
						e.archiveError = { message: 'not_available' };
					}
				} catch (ae) {
					normalizeError(ae, true);
					log.debug({ cause: ae.message, url: archiveUrl || url }, 'archive fetch failed');

					e.archiveError = ae;
					e.isTransient = ae.isTransient;
				}
			}
			throw e;
		} finally {
			await _.cutOff(page.close(), 3000);
			await _.cutOff(context.close(), 3000);
		}
	}
}

export async function resolveArchiveUrl(url) {
	try {
		// Availability API (Fast path)
		const res = await ky(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
			timeout: 20 * 1000,
		}).json();

		const closest = res?.archived_snapshots?.closest;
		if (closest?.available && closest?.status === '200')
			return closest.url;
	} catch (e) {
		normalizeError(e, true);
		log.debug({ cause: e.message, url }, 'archive fetch failed: Availability API');
	}

	log.debug({ url }, 'archive fallback');

	// CDX API (Accurate path)
	const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=1&fastLatest=true&filter=statuscode:200`;
	const json = await ky(api, {
		timeout: 30 * 1000,
		retry: { limit: 2, statusCodes: [503], retryOnTimeout: true },
	}).json();
	if (!Array.isArray(json))
		throw new Error('Invalid response');

	if (json.length < 2)
		return null;

	const [, timestamp, original] = json[1];
	return `https://web.archive.org/web/${timestamp}/${original}`;
}

async function setupCapture(page) {
	let html = '';
	let blocked = false;
	let initialDone = false;

	await page.route('**', async route => {
		const req = route.request();
		const type = req.resourceType();
		if (type === 'document' && req.frame() === page.mainFrame()) {
			// Allow server-side redirects
			if (req.redirectedFrom())
				return route.continue();

			// Capture the very first document load
			if (!initialDone) {
				initialDone = true;
				try {
					// Throw on redirect to fallback to route.continue() and prevent timeout
					const response = await route.fetch({ maxRedirects: 0 });
					if (response.status() >= 300 && response.status() < 400)
						throw new Error('Redirected');

					html = await response.text();
					return route.fulfill({ response });
				} catch (_) {
					// Reset so the redirected request can be captured
					initialDone = false;
					return route.continue();
				}
			}

			// Block subsequent JS redirects
			blocked = true;
			return route.fulfill({ body: '' });
		}

		// Proxy requests with a timeout to avoid tarpits
		const url = req.url();
		const isDynamic = /^(script|xhr|fetch)$/.test(type) &&
			/^(http|https):/.test(url);

		if (isDynamic) {
			try {
				const response = await route.fetch({ timeout: 3000 });
				return route.fulfill({ response });
			} catch (_) {
				return route.abort();
			}
		}

		// Block unnecessary binary resources
		const isAsset = /^(media|font)$/.test(type) ||
			/\.(mp4|webm|ogg|mp3|wav|woff|woff2|ttf|otf)(\?.*)?$/.test(url);

		return isAsset ? route.abort() : route.continue();
	});

	page.html = async () => {
		try {
			if (!blocked)
				html = await page.content();
		} catch (_) { }

		return html;
	};
}

function normalizeError(e, isArchive = false) {
	e.status ||= e.response?.status;

	const message = e.message || '';

	// isTransient: Do not persist error to DB so it can be retried later
	const codes = [
		'ERR_NETWORK_CHANGED',
		'ERR_INTERNET_DISCONNECTED',
		'ECONNRESET',
	];
	e.isTransient = codes.some(c => message.includes(c)) || (
		isArchive && (!e.status || e.status === 429 || e.status >= 500));

	// isRetryable: Retry immediately in the current fetch loop
	const retryableCodes = [
		'ERR_EMPTY_RESPONSE',
		'ERR_CONNECTION_RESET',
		'ERR_CONNECTION_CLOSED',
		'ERR_FAILED',
		'ERR_CONNECTION_TIMED_OUT',
		'ERR_TIMED_OUT',
		'ETIMEDOUT',
		'Invalid response',
		'Timeout',
		'timed out',
	];
	e.isRetryable = e.status >= 500 || retryableCodes.some(c => message.includes(c));

	let formatted = message.split('\n')[0].trim();
	const match = formatted.match(/net::(ERR_[A-Z_]+)/);
	e.message = e.status
		? '' + e.status
		: (match ? match[1] : formatted
			.replace(/^(page|apiRequestContext)\.\w+: /, '')
			.replace(/: .*/, ''));
	return e;
}
