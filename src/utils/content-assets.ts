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
	'.java',
	'.go',
	'.rs',
	'.rb',
	'.php',
	'.tf',
	'.hcl',
]);

const LANGUAGE_MAP: Record<string, string> = {
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	ts: 'typescript',
	tsx: 'tsx',
	jsx: 'jsx',
	py: 'python',
	yml: 'yaml',
	sh: 'bash',
	bash: 'bash',
	gql: 'graphql',
	md: 'markdown',
};

export type ContentPreviewKind = 'code' | 'image' | 'markdown' | 'external';

export function getExtension(pathname: string) {
	const clean = pathname.split('?')[0].split('#')[0];
	const dot = clean.lastIndexOf('.');
	return dot === -1 ? '' : clean.slice(dot).toLowerCase();
}

export function getPreviewKind(href: string): ContentPreviewKind {
	if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) return 'external';

	const ext = getExtension(href);
	if (ext === '.md') return 'markdown';
	if (IMAGE_EXTENSIONS.has(ext)) return 'image';
	if (CODE_EXTENSIONS.has(ext) || ext) return 'code';
	return 'external';
}

export function getShikiLanguage(pathname: string) {
	const ext = getExtension(pathname).slice(1);
	return LANGUAGE_MAP[ext] ?? ext ?? 'text';
}

export function toContentAssetUrl(relativePath: string, base: string) {
	const normalized = relativePath.replace(/^\.\//, '').replace(/\\/g, '/');
	const prefix = base.endsWith('/') ? base : `${base}/`;
	return `${prefix}content/${normalized}`;
}

export function toPostUrl(markdownPath: string, base: string) {
	const slug = markdownPath.replace(/^\.\//, '').replace(/\.md$/i, '').replace(/\\/g, '/');
	const prefix = base.endsWith('/') ? base : `${base}/`;
	return `${prefix}${slug}/`;
}
