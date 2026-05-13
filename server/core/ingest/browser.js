import _ from '../util.js';

import baseLog from '../log.js';
const log = baseLog.child({ module: 'ingest.browser' });

let browser;
let playwrightChromium;
let fetchCount = 0;

const MAX_FETCH_COUNT = 50;

async function getBrowser() {
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

	return browser;
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

function isTransient(e) {
	const msg = e.message || '';
	return [
		'ERR_NETWORK_CHANGED',
		'ERR_INTERNET_DISCONNECTED',
		'ERR_CONNECTION_RESET',
		'ERR_CONNECTION_CLOSED',
		'ERR_CONNECTION_TIMED_OUT',
		'ERR_TIMED_OUT',
		'ERR_FAILED',
	].some(code => msg.includes(code));
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

export async function fetch(url, date = null) {
	const isArchive = url.includes('//web.archive.org/');
	const browser = await getBrowser();

	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
		viewport: { width: 1280, height: 800 },
	});

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
		const response = await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: isArchive ? 50000 : 10000,
		});

		if (!response.ok()) {
			const error = new Error(`HTTP ${response.status()}: ${url}`);
			error.status = response.status();
			error.url = url;
			throw error;
		}

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
		// Clean up error message to keep only the first line
		e.message = e.message?.split?.('\n')?.[0]?.trim?.() || e.message;

		if (isTransient(e)) {
			e.isTransient = true;
			throw e;
		}

		// Fallback to Internet Archive if date is provided and not already an archive URL
		if (date && !isArchive) {
			const archiveUrl = `https://web.archive.org/web/${date}/${url}`;
			try {
				const res = await fetch(archiveUrl);
				log.debug({ url, archiveUrl }, 'fetch success via archive');
				res.html = `<base href="${res.url}">\n${res.html}`;
				return res;
			} catch (ae) {
				log.debug({ url, archiveUrl, error: ae.message }, 'archive fetch failed');
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
