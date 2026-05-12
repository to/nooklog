import _ from '../util.js';

import baseLog from '../log.js';
const log = baseLog.child({ module: 'ingest.browser' });

let browserServer;
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

	if (fetchCount >= MAX_FETCH_COUNT) {
		log.debug({ fetchCount }, 'restarting browser to release memory');
		await dispose();
		fetchCount = 0;
	}

	if (!browserServer || !browserServer.process()) {
		// Prevent Playwright from killing the parent process prematurely during shutdown
		// Browser processes still receive signals and exit normally on their own
		browserServer = await playwrightChromium.launchServer({
			args: ['--disable-gpu', '--disable-dev-shm-usage'],
			handleSIGINT: false,
			handleSIGTERM: false,
			handleSIGHUP: false,
		});
	}

	if (!browser || !browser.isConnected())
		browser = await playwrightChromium.connect(browserServer.wsEndpoint());

	return browser;
}

export async function dispose() {
	if (browser) {
		await _.cutOff(browser.close(), 5000);
		browser = null;
	}

	if (browserServer) {
		await _.cutOff(browserServer.close(), 5000);
		browserServer = null;
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
	fetchCount++;

	const { rss, heapUsed } = process.memoryUsage();
	log.debug({
		fetchCount,
		rss: `${Math.floor(rss / 1024 / 1024)}MB`,
		heap: `${Math.floor(heapUsed / 1024 / 1024)}MB`,
	}, 'fetching');

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
			route => route.abort());

		// Shorter timeout and lighter wait condition
		const response = await page.goto(url, {
			waitUntil: 'domcontentloaded',
			timeout: 10000,
		});

		if (!response.ok()) {
			const error = new Error(`HTTP ${response.status()}: ${url}`);
			error.status = response.status();
			error.url = url;
			throw error;
		}

		// Wait a bit for SPA content
		await page.waitForTimeout(1500);

		return {
			html: await page.content(),
			rawHtml: await response.text(),
			url: page.url(),
			title: await page.title(),
		};
	} finally {
		//
		if (page)
			await _.cutOff(page.close(), 3000);

		await _.cutOff(context.close(), 3000);
	}
}
