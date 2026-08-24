import path from 'node:path';
import { visit } from 'unist-util-visit';
import { joinBase } from './join-base.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);
const CODE_EXTENSIONS = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.ts',
	'.tsx',
	'.jsx',
	'.py',
	'.json',
	'.yaml',
	'.yml',
	'.sh',
	'.bash',
	'.graphql',
	'.gql',
	'.sql',
	'.css',
	'.html',
	'.xml',
	'.toml',
	'.env',
	'.mdx',
	'.astro',
]);

function getExtension(url) {
	const clean = url.split('?')[0].split('#')[0];
	const dot = clean.lastIndexOf('.');
	return dot === -1 ? '' : clean.slice(dot).toLowerCase();
}

function isRelative(url) {
	return !/^(https?:)?\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('#');
}

function resolveRelative(url, filePath) {
	const dir = path.dirname(filePath).replace(/\\/g, '/');
	const resolved = path.posix.normalize(path.posix.join(dir, url));
	return resolved.replace(/^src\/content\//, '');
}

/**
 * Rewrite relative content links:
 * - ./dir/... and ./images/... → /content/... (preview modal for code/images)
 * - ./post.md → /post-slug/ (normal navigation)
 */
export function remarkContentLinks(options = {}) {
	const base = options.base ?? '/';

	return (tree, file) => {
		const filePath = file.history?.[0]?.replace(/\\/g, '/') ?? '';
		if (!filePath.includes('src/content')) return;

		visit(tree, 'link', (node) => {
			const url = node.url;
			if (!isRelative(url)) return;

			const ext = getExtension(url);
			const resolved = resolveRelative(url, filePath);

			node.data ??= {};
			node.data.hProperties ??= {};

			if (ext === '.md') {
				const slug = resolved.replace(/\.md$/i, '');
				node.url = joinBase(base, `${slug}/`);
				return;
			}

			if (url.startsWith('./dir/') || url.startsWith('./images/') || resolved.startsWith('dir/') || resolved.startsWith('images/')) {
				const assetPath = resolved.startsWith('dir/') || resolved.startsWith('images/') ? resolved : url.replace(/^\.\//, '');
				node.url = joinBase(base, `content/${assetPath}`);

				if (IMAGE_EXTENSIONS.has(ext)) {
					node.data.hProperties['data-content-preview'] = 'image';
				} else if (CODE_EXTENSIONS.has(ext) || ext) {
					node.data.hProperties['data-content-preview'] = 'code';
				}
				node.data.hProperties.className = ['content-preview-link'];
				return;
			}

			// Other relative assets under content (e.g. ./dir/...)
			if (IMAGE_EXTENSIONS.has(ext)) {
				node.url = joinBase(base, `content/${resolved}`);
				node.data.hProperties['data-content-preview'] = 'image';
				node.data.hProperties.className = ['content-preview-link'];
			} else if (CODE_EXTENSIONS.has(ext)) {
				node.url = joinBase(base, `content/${resolved}`);
				node.data.hProperties['data-content-preview'] = 'code';
				node.data.hProperties.className = ['content-preview-link'];
			}
		});
	};
}
