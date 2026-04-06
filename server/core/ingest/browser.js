import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

let browser = null;

async function getBrowser() {
	if (!browser || !browser.isConnected())
		browser = await chromium.launch();
	return browser;
}

export async function dispose() {
	if (browser) {
		await browser.close();
		browser = null;
	}
}

export async function fetch(url) {
	const browser = await getBrowser();
	const context = await browser.newContext({
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
	});

	try {
		const page = await context.newPage();
		const response = await page.goto(url, { waitUntil: 'load', timeout: 20000 });

		if (!response.ok()) {
			const error = new Error(`HTTP ${response.status()}: ${url}`);
			error.status = response.status();
			error.url = url;
			throw error;
		}

		await page.waitForTimeout(2000);

		return {
			html: await page.content(),
			title: await page.title(),
		};
	} finally {
		await context.close();
	}
}
