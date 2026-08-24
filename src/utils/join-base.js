/**
 * Join Astro base path with a relative app path.
 * Handles base with or without trailing slash (e.g. `/KubeAndCode` → `/KubeAndCode/content/...`).
 */
export function joinBase(base, pathname) {
	if (!pathname || pathname.startsWith('http://') || pathname.startsWith('https://')) {
		return pathname;
	}

	const normalizedBase = base === '/' ? '/' : base.endsWith('/') ? base : `${base}/`;
	const normalizedPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
	return `${normalizedBase}${normalizedPath}`;
}
