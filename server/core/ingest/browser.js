import _ from '../util.js';
import ky from 'ky';

import baseLog from '../log.js';
const log = baseLog.child({ module: 'ingest.browser' });

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
	const context = await newContext();

	let page;
	try {
		page = await context.newPage();

		let rawHtml = '';
		let initialDone = false;
		let blocked = false;

		// Intercept requests to block JS redirects and unnecessary assets
		await page.route('**', async route => {
			const req = route.request();
			const type = req.resourceType();
			if (type === 'document' && req.frame() === page.mainFrame()) {
				// Always allow server-side redirects
				if (req.redirectedFrom())
					return route.continue();

				// Capture the very first document load
				if (!initialDone) {
					initialDone = true;
					try {
						const response = await route.fetch();
						rawHtml = await getText(response);
						return route.fulfill({ response });
					} catch (_) {
						return route.continue();
					}
				}

				// Block subsequent JS redirects/evictions with a dummy page
				blocked = true;
				return route.fulfill({ body: '' });
			}

			// Block unnecessary binary resources
			const isAsset = /^(image|media|font|stylesheet)$/.test(type) ||
				/\.(png|jpg|jpeg|gif|webp|svg|mp4|webm|ogg|mp3|wav|woff|woff2|ttf|otf|css)(\?.*)?$/.test(req.url());

			return isAsset ? route.abort() : route.continue();
		});

		// Shorter timeout and lighter wait condition
		const response = await act(() => page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: isArchive ? 50000 : 15000,
		}));

		// Ensure we have the raw HTML from the initial response
		rawHtml ||= await getText(response);

		// Wait for SPA/Dynamic content if navigation wasn't blocked
		await page.waitForTimeout(1500);

		// Prefer rawHtml if navigation was blocked to avoid capturing the dummy page
		let html = rawHtml;
		let title = '';
		if (!blocked) {
			try {
				html = await page.content();
				title = await page.title();
			} catch (_) {
				// Fallback to initial response if page became inaccessible
			}
		}

		return {
			title,
			url: response.url(),
			html,
			rawHtml,
		};
	} catch (e) {
		normalizeError(e, isArchive);

		if (e.isTransient)
			throw e;

		if (!isArchive) {
			log.debug({ cause: e.message, url }, 'fetch failed');

			try {
				// Resolve direct archive URL to bypass interstitial redirect pages
				let archiveUrl = await resolveArchiveUrl(url);
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

				log.debug({ cause: ae.message, url }, 'archive fetch failed');
				e.archiveError = ae;
				e.isTransient = ae.isTransient;
				throw e;
			}
		}

		throw e;
	} finally {
		if (page)
			await _.cutOff(page.close(), 3000);

		await _.cutOff(context.close(), 3000);
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
	} catch (_) { }

	// await _.wait(3000);
	log.debug({ url }, 'archive fallback');

	// CDX API (Accurate path)
	const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=-1&fastLatest=true&filter=statuscode:200`;
	const json = await ky(api, {
		timeout: 40 * 1000,
		retry: { limit: 2, statusCodes: [503] },
	}).json();
	if (!Array.isArray(json))
		throw new Error('Invalid response');

	if (json.length < 2)
		return null;

	const [, timestamp, original] = json[1];
	return `https://web.archive.org/web/${timestamp}/${original}`;
}

async function act(fn) {
	const res = await fn();
	if (res.ok())
		return res;

	const error = new Error(`HTTP ${res.status()}`);
	error.status = res.status();
	throw error;
}

function normalizeError(e, isArchive = false) {
	e.status ||= e.response?.status;

	const message = e.message || '';
	const codes = [
		'ERR_NETWORK_CHANGED',
		'ERR_INTERNET_DISCONNECTED',
		'ERR_CONNECTION_RESET',
		'ERR_CONNECTION_CLOSED',
		'ERR_FAILED',
		'ECONNRESET',
		'ETIMEDOUT',
		'ENOTFOUND',
	].concat(isArchive ? [
		'ERR_TIMED_OUT',
		'ERR_CONNECTION_TIMED_OUT',
		'Invalid response',
		'Timeout',
		'timed out',
	] : []);
	e.isTransient = (e.status && (e.status === 429 || e.status >= 500)) || codes.some(c => message.includes(c));

	let formatted = message.split('\n')[0].trim();
	const match = formatted.match(/net::(ERR_[A-Z_]+)/);
	e.message = e.status
		? '' + e.status
		: (match ? match[1] : formatted
			.replace(/^(page|apiRequestContext)\.\w+: /, '')
			.replace(/: .*/, ''));
	return e.message;
}

async function getText(response) {
	try {
		return await response.text();
	} catch (e) {
		const isProtocolError =
			e.message.includes('No resource with given identifier found') ||
			e.message.includes('Response body is unavailable for redirect responses');

		// Silent fallback: rawHtml is unavailable due to browser/protocol limits
		if (isProtocolError)
			return '';

		throw e;
	}
}
