/** Prefix an app path with Astro's deploy base (e.g. `/my-blog/` on GitHub Pages). */
export function withBase(path = '') {
	const base = import.meta.env.BASE_URL;

	if (!path || path === '/') {
		return base;
	}

	if (path.startsWith('http://') || path.startsWith('https://')) {
		return path;
	}

	const suffix = path.startsWith('/') ? path.slice(1) : path;
	return `${base}${suffix}`;
}

/** Homepage URL filtered by a single tag. */
export function tagFilterUrl(tag: string) {
	return withBase(`?tag=${encodeURIComponent(tag)}`);
}
