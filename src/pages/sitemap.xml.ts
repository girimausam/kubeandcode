import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SERIES_LIST } from '../data/series';
import { getAllTags } from '../utils/posts';
import fs from 'node:fs';
import path from 'node:path';

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts');
  const tags = getAllTags(posts);
  const siteUrl = 'https://mausamgiri.in';
  const baseUrl = '/blogs';

  const urls: { loc: string; lastmod: string; changefreq: string; priority: string }[] = [];

  const today = new Date().toISOString().split('T')[0];

  // 1. Homepage
  urls.push({
    loc: `${siteUrl}${baseUrl}/`,
    lastmod: today,
    changefreq: 'daily',
    priority: '1.0',
  });

  // 2. All Posts archive (/blogs/posts/)
  urls.push({
    loc: `${siteUrl}${baseUrl}/posts/`,
    lastmod: today,
    changefreq: 'daily',
    priority: '0.9',
  });

  // 3. About page (/blogs/about/)
  urls.push({
    loc: `${siteUrl}${baseUrl}/about/`,
    lastmod: today,
    changefreq: 'monthly',
    priority: '0.7',
  });

  // 4. Series Index (/blogs/series/)
  urls.push({
    loc: `${siteUrl}${baseUrl}/series/`,
    lastmod: today,
    changefreq: 'weekly',
    priority: '0.9',
  });

  // 5. Series Hubs (/blogs/series/<series>/)
  for (const series of SERIES_LIST) {
    urls.push({
      loc: `${siteUrl}${baseUrl}/series/${series.slug}/`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.85',
    });
  }

  // 6. Posts (/blogs/<slug>/)
  for (const post of posts) {
    let lastmodDate = post.data.date;
    if (!lastmodDate) {
      try {
        const stats = fs.statSync(path.join(process.cwd(), 'src/content', `${post.id}.md`));
        lastmodDate = stats.mtime;
      } catch {
        lastmodDate = new Date();
      }
    }
    const lastmod = (lastmodDate instanceof Date ? lastmodDate : new Date(lastmodDate))
      .toISOString()
      .split('T')[0];

    urls.push({
      loc: `${siteUrl}${baseUrl}/${post.id}/`,
      lastmod,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }

  // 7. Dedicated Tag pages (/blogs/tags/<tag>/)
  for (const { tag } of tags) {
    urls.push({
      loc: `${siteUrl}${baseUrl}/tags/${encodeURIComponent(tag)}/`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};
