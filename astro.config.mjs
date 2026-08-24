// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { remarkAdmonitions } from './src/utils/remark-admonitions.js';
import { remarkMermaid } from './src/utils/remark-mermaid.js';
import { remarkContentLinks } from './src/utils/remark-content-links.js';
import { contentAssetsIntegration } from './src/integrations/content-assets.js';

const base = process.env.ASTRO_BASE ?? '/';

export default defineConfig({
	site: process.env.ASTRO_SITE,
	base,
	trailingSlash: 'always',
	integrations: [contentAssetsIntegration()],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkDirective, remarkAdmonitions, remarkMermaid, [remarkContentLinks, { base }]],
		}),
		shikiConfig: {
			themes: {
				light: 'min-light',
				dark: 'min-dark',
			},
		},
	},
});
