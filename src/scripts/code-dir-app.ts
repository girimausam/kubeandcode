import { codeToHtml } from 'shiki';
import { langFromPath, type DirNode } from '../utils/code-dir';

export type CodeDirPayload = { tree: DirNode[]; files: string[]; fileBase: string };

declare global {
	interface Window {
		__CODE_DIR: CodeDirPayload;
	}
}

const highlightCache = new Map<string, string>();

function themeName() {
	return document.documentElement.dataset.theme === 'dark' ? 'min-dark' : 'min-light';
}

function renderTree(nodes: DirNode[], depth = 0): string {
	return nodes
		.map((n) => {
			if (n.children) {
				return `<details data-depth="${depth}"${depth < 1 ? ' open' : ''}>
					<summary>${escapeHtml(n.name)}</summary>
					<div class="kids">${renderTree(n.children, depth + 1)}</div>
				</details>`;
			}
			return `<button type="button" class="file" data-path="${escapeAttr(n.path!)}">${escapeHtml(n.name)}</button>`;
		})
		.join('');
}

function escapeHtml(s: string) {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function escapeAttr(s: string) {
	return escapeHtml(s);
}

async function highlight(path: string, code: string, lang: string) {
	const key = `${themeName()}:${path}:${code.length}`;
	const hit = highlightCache.get(key);
	if (hit) return hit;
	let html: string;
	try {
		html = await codeToHtml(code, { lang, theme: themeName() });
	} catch {
		html = await codeToHtml(code, { lang: 'text', theme: themeName() });
	}
	highlightCache.set(key, html);
	return html;
}

export function initCodeDir(opts: CodeDirPayload) {
	const treeEl = document.querySelector<HTMLElement>('[data-tree]')!;
	const viewEl = document.querySelector<HTMLElement>('[data-view]')!;
	const pathEl = document.querySelector<HTMLElement>('[data-path-label]')!;
	const fileSet = new Set(opts.files);

	treeEl.innerHTML = renderTree(opts.tree);

	async function openPath(rel: string) {
		if (!fileSet.has(rel)) return;
		for (const b of treeEl.querySelectorAll('.file')) {
			b.classList.toggle('on', b.getAttribute('data-path') === rel);
		}
		pathEl.textContent = rel;
		history.replaceState(null, '', `#${encodeURIComponent(rel)}`);
		viewEl.textContent = '…';
		const url = opts.fileBase.replace(/\/?$/, '/') + rel.split('/').map(encodeURIComponent).join('/');
		const res = await fetch(url);
		if (!res.ok) {
			viewEl.textContent = `failed (${res.status})`;
			return;
		}
		const text = await res.text();
		if (text.length > 400_000) {
			viewEl.innerHTML = `<pre class="raw">${escapeHtml(text.slice(0, 400_000))}\n\n… truncated</pre>`;
			return;
		}
		viewEl.innerHTML = await highlight(rel, text, langFromPath(rel));
	}

	treeEl.addEventListener('click', (e) => {
		const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.file');
		if (!btn?.dataset.path) return;
		void openPath(btn.dataset.path);
	});

	const fromHash = decodeURIComponent(location.hash.replace(/^#/, ''));
	if (fromHash && fileSet.has(fromHash)) void openPath(fromHash);

	new MutationObserver(() => {
		highlightCache.clear();
		const p = pathEl.textContent;
		if (p && fileSet.has(p)) void openPath(p);
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
