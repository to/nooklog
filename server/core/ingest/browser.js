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
		}, 'fetching');
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

export async function fetch(url) {
	const browser = await getBrowser();

	const context = await browser.newContext({
		ignoreHTTPSErrors: true,
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
	});

	let page;
	try {
		page = await context.newPage();

		// Block unnecessary resources to speed up
		await page.route(
			'**/*.{png,jpg,jpeg,gif,webp,svg,mp4,webm,ogg,mp3,wav,woff,woff2,ttf,otf,css}',
			route => {
				return (route.request().resourceType() === 'document')
					? route.continue()
					: route.abort();
			});

		// Shorter timeout and lighter wait condition
		const response = await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: 10000,
		});

		// Fetch raw HTML immediately before the page has a chance to navigate away
		let rawHtml = '';
		try {
			rawHtml = await response.text();
		} catch (e) {
			const isProtocolError =
				e.message.includes('No resource with given identifier found') ||
				e.message.includes('Response body is unavailable for redirect responses');
			if (isProtocolError) {
				// Silent fallback: rawHtml is unavailable due to browser/protocol limits,
				// but page.content() will provide the rendered version later.
			} else {
				throw e;
			}
		}

		if (!response.ok()) {
			const error = new Error(`HTTP ${response.status()}: ${url}`);
			error.status = response.status();
			error.url = url;
			throw error;
		}

		// Wait a bit for SPA content
		await page.waitForTimeout(1500);

		// Safely retrieve title and content, falling back to rawHtml if page is already navigating
		let html = rawHtml;
		let title = '';
		try {
			html = await page.content();
			title = await page.title();
		} catch (_) {
			// Fallback to initial response if page became inaccessible
		}

		return {
			html,
			rawHtml,
			url: page.url(),
			title: title,
		};
	} finally {
		if (page)
			await _.cutOff(page.close(), 3000);

		await _.cutOff(context.close(), 3000);
	}
}
