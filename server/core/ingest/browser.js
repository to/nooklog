let browserServer;
let browser;
let playwrightChromium;

import baseLog from '../log.js';
const log = baseLog.child({ module: 'ingest.browser' });

async function getBrowser() {
	if (!playwrightChromium) {
		const [{ chromium }, { default: stealth }] = await Promise.all([
			import('playwright-extra'),
			import('puppeteer-extra-plugin-stealth'),
		]);
		chromium.use(stealth());
		playwrightChromium = chromium;
	}

	if (!browserServer || !browserServer.process()) {
		browserServer = await playwrightChromium.launchServer({
			args: ['--disable-gpu', '--disable-dev-shm-usage'],
		});
	}

	if (!browser || !browser.isConnected())
		browser = await playwrightChromium.connect(browserServer.wsEndpoint());

	return browser;
}

export async function dispose() {
	if (browser) {
		browser.close().catch(() => { });
		browser = null;
	}

	if (browserServer) {
		// Prevent the browser process from hanging the shutdown sequence
		const proc = browserServer.process();
		const forceKill = setTimeout(() => {
			if (browserServer) {
				log.warn('browser server close timed out, forcing kill');
				try {
					proc?.kill('SIGKILL');
				} catch (e) {
					log.error({ error: e.message }, 'failed to kill browser process');
				}
			}
		}, 3000);
		forceKill.unref();

		try {
			log.info('closing browser server...');
			await browserServer.close();
			log.info('browser server closed gracefully');
		} catch (e) {
			log.warn({ error: e.message }, 'browser server close error');
		} finally {
			clearTimeout(forceKill);
			browserServer = null;
		}
	}
}

export async function fetch(url) {
	const browser = await getBrowser();

	const context = await browser.newContext({
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
	});

	try {
		const page = await context.newPage();

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
		await context.close();
	}
}
