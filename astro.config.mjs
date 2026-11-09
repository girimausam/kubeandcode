// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { remarkAdmonitions } from './src/utils/remark-admonitions.js';
import { remarkMermaid } from './src/utils/remark-mermaid.js';
import { remarkContentLinks } from './src/utils/remark-content-links.js';
import { remarkHeadingHygiene } from './src/utils/remark-heading-hygiene.js';
import { contentAssetsIntegration } from './src/integrations/content-assets.js';

const base = process.env.ASTRO_BASE ?? '/';
const site = process.env.ASTRO_SITE ?? 'https://mausamgiri.in';

export default defineConfig({
	site,
	base,
	trailingSlash: 'ignore',
	build: {
		inlineStylesheets: 'always',
	},
	integrations: [contentAssetsIntegration()],
	markdown: {
		processor: unified({
			remarkPlugins: [
				remarkDirective,
				remarkAdmonitions,
				remarkHeadingHygiene,
				remarkMermaid,
				[remarkContentLinks, { base }],
			],
		}),
		shikiConfig: {
			themes: {
				light: 'min-light',
				dark: 'min-dark',
			},
		},
	},
});
