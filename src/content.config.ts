import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const linkSchema = z.object({
	title: z.string(),
	url: z.string().url(),
});

export const collections = {
	posts: defineCollection({
		loader: glob({ base: './src/content', pattern: '*.md' }),
		schema: z.object({
			title: z.string(),
			description: z.string().optional().default(''),
			date: z.coerce.date().optional(),
			author: z.string().optional(),
			tags: z.array(z.string()).default([]),
			links: z.array(linkSchema).optional(),
			resources: z.array(linkSchema).optional(),
			image: z.string().optional(),
		}),
	}),
};
