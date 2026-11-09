import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export function getPostLinks(post: Post) {
	return post.data.links ?? post.data.resources ?? [];
}

export function getAllTags(posts: Post[]) {
	const counts = new Map<string, number>();

	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([tag, count]) => ({ tag, count }));
}

export function getAllResources(posts: Post[]) {
	const seen = new Set<string>();
	const resources: { title: string; url: string }[] = [];

	for (const post of posts) {
		for (const resource of getPostLinks(post)) {
			if (seen.has(resource.url)) continue;
			seen.add(resource.url);
			resources.push(resource);
		}
	}

	return resources.sort((a, b) => a.title.localeCompare(b.title));
}

export function getRelatedPosts(post: Post, posts: Post[], limit = 4) {
	const stopWords = new Set(['and', 'the', 'with', 'for', 'from', 'into', 'using', 'guide', 'runbook', 'aws']);
	const words = new Set(
		post.data.title
			.toLowerCase()
			.split(/\W+/)
			.filter((word) => word.length > 2 && !stopWords.has(word))
	);

	const scored = posts
		.filter((entry) => entry.id !== post.id)
		.map((entry) => {
			const sharedTags = entry.data.tags.filter((tag) => post.data.tags.includes(tag)).length;
			const titleOverlap = entry.data.title
				.toLowerCase()
				.split(/\W+/)
				.filter((word) => words.has(word)).length;

			return { entry, score: sharedTags * 4 + titleOverlap * 2 };
		})
		.sort((a, b) => b.score - a.score || (b.entry.data.date?.getTime() ?? 0) - (a.entry.data.date?.getTime() ?? 0));

	const filtered = scored.filter(({ score }) => score > 0).slice(0, limit).map(({ entry }) => entry);

	// Ensure at least 4 related posts if total posts allow
	if (filtered.length < limit) {
		for (const { entry } of scored) {
			if (!filtered.some((f) => f.id === entry.id)) {
				filtered.push(entry);
				if (filtered.length >= limit) break;
			}
		}
	}

	return filtered;
}

export function formatDate(date: Date) {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}
