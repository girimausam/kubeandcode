import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentRoot = path.join(root, 'src/content');
const assetDirs = ['dir', 'images'];

function copyAssets(outDir) {
	const targetRoot = path.join(outDir, 'content');
	fs.mkdirSync(targetRoot, { recursive: true });

	for (const dir of assetDirs) {
		const source = path.join(contentRoot, dir);
		if (!fs.existsSync(source)) continue;
		fs.cpSync(source, path.join(targetRoot, dir), { recursive: true });
	}
}

function resolveAssetRequest(url, base) {
	let pathname = decodeURIComponent(url.split('?')[0]);
	const normalizedBase = base === '/' ? '' : base.endsWith('/') ? base.slice(0, -1) : base;
	if (normalizedBase && pathname.startsWith(normalizedBase)) {
		pathname = pathname.slice(normalizedBase.length);
	}
	if (!pathname.startsWith('/content/')) return null;
	const relative = pathname.replace(/^\/content\//, '');
	const filePath = path.join(contentRoot, relative);
	if (!filePath.startsWith(contentRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
		return null;
	}
	return filePath;
}

/** Copy src/content/{dir,images} to dist/content and serve in dev. */
export function contentAssetsIntegration() {
	return {
		name: 'content-assets',
		hooks: {
			'astro:server:setup': ({ server }) => {
				const base = server.config.base ?? '/';
				server.middlewares.use((req, res, next) => {
					const filePath = resolveAssetRequest(req.url ?? '', base);
					if (!filePath) return next();
					res.setHeader('Cache-Control', 'no-cache');
					fs.createReadStream(filePath).pipe(res);
				});
			},
			'astro:build:done': ({ dir }) => {
				copyAssets(fileURLToPath(dir));
			},
		},
	};
}
