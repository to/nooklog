import os from 'node:os';
import { os as orpc } from '@orpc/server';
import { z } from 'zod';
import { EventPublisher } from '@orpc/server';
import archiver from 'archiver';
import nooklog from './core/nooklog.js';
import * as ingestHtml from './core/ingest/html.js';
import baseLog from './core/log.js';
import hub from './core/hub.js';

const publisher = new EventPublisher();
hub.on('*', data => {
	publisher.publish('message', data);
});

const log = baseLog.child({ module: 'router' });

const inputArrayField = z.array(z.string())
	.or(z.string().transform(v => v.split(',').filter(Boolean)));

const idOrUrlSchema = z.union([
	z.object({ id: z.string(), url: z.string().optional() }),
	z.object({ url: z.string(), id: z.string().optional() }),
]);

const searchSchema = z.object({
	url: z.string().optional(),
	tags: inputArrayField.optional(),
	rating: z.number().int().min(0).max(5).optional(),
	query: z.string().default(''),
	mode: z.enum(['fts', 'vector', 'hybrid']).default('fts'),
	useVectorIndex: z.boolean().optional(),
	fields: inputArrayField.optional(),
});

const bookmarkSchema = z.object({
	id: z.string(),
	url: z.string(),
	title: z.string(),
	memo: z.string(),
	summary: z.string(),
	tags: z.array(z.string()),
	rating: z.number().int().min(0).max(5),
	markdown: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
});

export const router = {
	search: orpc
		.route({ method: 'GET', path: '/search' })
		.input(searchSchema.extend({
			sortBy: z.enum(['updated_at', 'created_at', 'rating', 'relevance']).default('updated_at'),
			limit: z.coerce.number().default(300),
		}))
		.output(z.object({
			count: z.number(),
			totalCount: z.number(),
			bookmarks: z.array(bookmarkSchema.omit({
				markdown: true,
			}).extend({
				score: z.number().optional(),
				chunk: z.string().optional(),
				chunkField: z.string().optional(),
			})).default([]),
		}))
		.handler(async ({ input }) => {
			return await nooklog.search(input);
		}),

	find: orpc
		.route({ method: 'GET', path: '/find' })
		.input(idOrUrlSchema)
		.output(bookmarkSchema.nullish())
		.handler(async ({ input }) => {
			return await nooklog.find(input);
		}),

	save: orpc
		.route({ method: 'POST', path: '/save' })
		.input(z.object({
			title: z.string(),
			memo: z.string(),
			summary: z.string(),
			rating: z.number().int().min(0).max(5),
			tags: inputArrayField,
			markdown: z.string(),
			html: z.string(),
		}).partial().and(idOrUrlSchema))
		.output(bookmarkSchema)
		.handler(async ({ input }) => {
			return await nooklog.save(input);
		}),

	delete: orpc
		.route({ method: 'POST', path: '/delete' })
		.input(z.object({
			id: z.string(),
		}))
		.output(bookmarkSchema.nullish())
		.handler(async ({ input }) => {
			if (!input.id)
				throw new Error('Missing id');
			return await nooklog.delete(input.id);
		}),

	import: orpc
		.route({
			method: 'POST',
			path: '/import',
			inputStructure: 'detailed',
		})
		.input(z.object({
			query: z.object({
				folderTag: z.boolean().default(false),
			}).partial(),
			body: z.union([
				z.string(),
				z.object({}).catchall(z.any()), // z.record(z.any()) causes Zod v4 crash
				z.array(z.any()),
				z.any(), // oz.file() causes Zod v4 crash
			]),
		}))
		.output(z.object({
			count: z.number(),
		}))
		.handler(async ({ input }) => {
			let body = input.body;

			// Handle oRPC nesting and potential File objects
			if (body?.body !== undefined && Object.keys(body).length === 1)
				body = body.body;
			if (typeof body?.text === 'function')
				body = await body.text().catch(() => body);

			return await nooklog.import(body, input.query);
		}),

	export: orpc
		.route({ method: 'GET', path: '/export' })
		.input(searchSchema.extend({
			exportFormat: z.enum(['json', 'html', 'markdown']),
			exportMeta: z.enum(['plain', 'full']).default('plain'),
			exportStructure: z.enum(['flat', 'folders']).default('flat'),
		}))
		.output(z.any().optional())
		.handler(async ({ input, context }) => {
			const date = new Intl.DateTimeFormat('sv-SE').format(new Date());
			const res = context.response;

			if (input.exportFormat === 'json') {
				res.setHeader(
					'Content-Disposition',
					`attachment; filename="nooklog-bookmarks-${date}.json"`);
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify(
					await nooklog.exportObject(input), null, '\t'));
			}

			if (input.exportFormat === 'html') {
				res.setHeader(
					'Content-Disposition',
					`attachment; filename="nooklog-bookmarks-${date}.html"`);
				res.setHeader('Content-Type', 'text/html');
				res.end(await nooklog.exportHTML(input));
			}

			if (input.exportFormat === 'markdown') {
				const archive = archiver('zip', { zlib: { level: 6 } });
				const filename = `nooklog-markdown-${date}.zip`;
				res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
				res.setHeader('Content-Type', 'application/zip');
				archive.pipe(res);
				await nooklog.exportMarkdown(archive, input);
			}

			// Omit oRPC output (assuming OpenAPI access only)
			res.writeHead = () => res;
			res.end = () => res;
		}),

	getVectorModels: orpc
		.route({ tags: ['internal'] })
		.input(z.string().optional())
		.output(z.array(z.string()))
		.handler(async ({ input }) => {
			return await nooklog.getVectorModels(input);
		}),

	getTags: orpc
		.route({ method: 'GET', path: '/tags' })
		.output(z.array(z.string()))
		.handler(async () => {
			return await nooklog.getTags();
		}),

	stash: orpc
		.route({
			method: 'POST',
			path: '/stash',
			tags: ['internal'],
		})
		.input(z.any())
		.handler(async ({ input }) => {
			await nooklog.stash(input);
		}),

	pop: orpc
		.route({
			method: 'POST',
			path: '/pop',
			tags: ['internal'],
		})
		.input(z.any())
		.handler(async ({ input }) => {
			return await nooklog.pop(input);
		}),

	backfillContent: orpc
		.route({ method: 'POST', path: '/backfillContent' })
		.input(z.object({
			limit: z.number().int().min(1).default(100),
			force: z.boolean().default(false),
		}))
		.output(z.object({
			count: z.number(),
		}))
		.handler(async ({ input }) => {
			return await nooklog.backfillContent(input);
		}),

	convertMarkdown: orpc
		.route({ method: 'POST', path: '/markdown/convert' })
		.input(z.object({
			url: z.string().optional(),
			html: z.string(),
		}))
		.output(z.object({
			markdown: z.string(),
		}))
		.handler(async ({ input }) => {
			const { html, ...rest } = ingestHtml.process(input.url, input.html);
			return rest;
		}),

	config: {
		get: orpc
			.route({ tags: ['internal'] })
			.handler(async () => nooklog.getConfig()),

		save: orpc
			.route({ tags: ['internal'] })
			.input(z.unknown())
			.handler(async ({ input }) => nooklog.saveConfig(input)),

		generateApiKey: orpc
			.route({ tags: ['internal'] })
			.handler(async () => nooklog.generateApiKey()),
	},

	status: orpc
		.route({ method: 'GET', path: '/status' })
		.output(z.object({
			uptime: z.number(),
			memory: z.object({
				rss: z.number(),
				heapTotal: z.number(),
				heapUsed: z.number(),
				external: z.number(),
				arrayBuffers: z.number().optional(),
			}),
			system: z.object({
				total: z.number(),
				free: z.number(),
			}),
		}))
		.handler(async () => {
			const toMB = bytes => Math.floor(bytes / 1024 / 1024);
			return {
				uptime: process.uptime(),
				memory: Object.fromEntries(
					Object.entries(process.memoryUsage()).map(([k, v]) => [k, toMB(v)]),
				),
				system: {
					total: toMB(os.totalmem()),
					free: toMB(os.freemem()),
				},
			};
		}),

	// Generic SSE Event Stream
	event: orpc
		.route({ method: 'GET', path: '/event', tags: ['internal'] })
		.handler(async function* ({ signal }) {
			for await (const payload of publisher.subscribe('message', { signal }))
				yield payload;
		}),
};
