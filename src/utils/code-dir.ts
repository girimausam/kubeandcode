const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|otf|mp4|bin|exe|dll)$/i;

export function isTextFile(relPath: string) {
	return !BINARY.test(relPath);
}

export function langFromPath(relPath: string) {
	const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
	const map: Record<string, string> = {
		js: 'javascript',
		mjs: 'javascript',
		cjs: 'javascript',
		ts: 'typescript',
		tsx: 'tsx',
		jsx: 'jsx',
		py: 'python',
		rb: 'ruby',
		go: 'go',
		rs: 'rust',
		java: 'java',
		kt: 'kotlin',
		sh: 'bash',
		bash: 'bash',
		zsh: 'bash',
		yml: 'yaml',
		yaml: 'yaml',
		json: 'json',
		md: 'markdown',
		sql: 'sql',
		css: 'css',
		html: 'html',
		xml: 'xml',
		toml: 'toml',
		ini: 'ini',
		env: 'ini',
		tf: 'hcl',
		hcl: 'hcl',
		graphql: 'graphql',
		gql: 'graphql',
		dockerfile: 'docker',
		txt: 'text',
	};
	if (relPath.toLowerCase().endsWith('dockerfile')) return 'docker';
	return map[ext] ?? 'text';
}

export type DirNode = { name: string; path?: string; children?: DirNode[] };

export function pathsToTree(paths: string[]): DirNode[] {
	type Rec = { dirs: Map<string, Rec>; files: { name: string; path: string }[] };
	const root: Rec = { dirs: new Map(), files: [] };

	for (const path of paths.sort()) {
		const parts = path.split('/');
		let node = root;
		for (let i = 0; i < parts.length; i++) {
			const name = parts[i];
			if (i === parts.length - 1) {
				node.files.push({ name, path });
			} else {
				let next = node.dirs.get(name);
				if (!next) {
					next = { dirs: new Map(), files: [] };
					node.dirs.set(name, next);
				}
				node = next;
			}
		}
	}

	function toNodes(rec: Rec, prefix: string): DirNode[] {
		const dirs: DirNode[] = [...rec.dirs.entries()].map(([name, child]) => ({
			name,
			children: toNodes(child, prefix ? `${prefix}/${name}` : name),
		}));
		const files: DirNode[] = rec.files.map((f) => ({ name: f.name, path: f.path }));
		return [...dirs, ...files];
	}

	return toNodes(root, '');
}
