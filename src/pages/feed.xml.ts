import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts');
  const siteUrl = 'https://mausamgiri.in';
  const baseUrl = '/blogs';

  // Sort posts by date descending
  const sorted = [...posts].sort((a, b) => {
    const da = a.data.date ? new Date(a.data.date).getTime() : 0;
    const db = b.data.date ? new Date(b.data.date).getTime() : 0;
    return db - da;
  });

  const items = sorted.map((post) => {
    let postDate = post.data.date;
    if (!postDate) {
      try {
        const stats = fs.statSync(path.join(process.cwd(), 'src/content', `${post.id}.md`));
        postDate = stats.mtime;
      } catch {
        postDate = new Date();
      }
    }
    const pubDate = (postDate instanceof Date ? postDate : new Date(postDate)).toUTCString();
    const link = `${siteUrl}${baseUrl}/${post.id}/`;

    return `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapeXml(post.data.description || post.data.title)}</description>
      <pubDate>${pubDate}</pubDate>
      <author>mausam@mausamgiri.in (Mausam Giri)</author>
      ${post.data.tags.map((t) => `<category>${escapeXml(t)}</category>`).join('\n      ')}
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AWS, EKS &amp; DevOps Guides | Mausam Giri</title>
    <link>${siteUrl}${baseUrl}/</link>
    <description>Practical AWS, EKS, and DevOps runbooks with console-first workflows, architecture patterns, and production troubleshooting guides by Mausam Giri.</description>
    <language>en-us</language>
    <atom:link href="${siteUrl}${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};

