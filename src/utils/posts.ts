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

export function getRelatedPosts(post: Post, posts: Post[], limit = 3) {
	const words = new Set(
		post.data.title
			.toLowerCase()
			.split(/\W+/)
			.filter((word) => word.length > 2)
	);

	return posts
		.filter((entry) => entry.id !== post.id)
		.map((entry) => {
			const sharedTags = entry.data.tags.filter((tag) => post.data.tags.includes(tag)).length;
			const titleOverlap = entry.data.title
				.toLowerCase()
				.split(/\W+/)
				.filter((word) => words.has(word)).length;

			return { entry, score: sharedTags * 3 + titleOverlap };
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || (b.entry.data.date?.getTime() ?? 0) - (a.entry.data.date?.getTime() ?? 0))
		.slice(0, limit)
		.map(({ entry }) => entry);
}

export function formatDate(date?: Date) {
	if (!date) return undefined;
	return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}
