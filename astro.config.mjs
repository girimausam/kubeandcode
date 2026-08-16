// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { remarkAdmonitions } from './src/utils/remark-admonitions.js';

export default defineConfig({
	trailingSlash: 'always',
	markdown: {
		processor: unified({
			remarkPlugins: [remarkDirective, remarkAdmonitions],
		}),
		shikiConfig: {
			themes: {
				light: 'min-light',
				dark: 'min-dark',
			},
		},
	},
});
