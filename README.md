# Blogs

A minimal Astro blog with three layouts: landing, post, and search.

## Content

Add `.md` files to `src/content/`:

```md
---
title: Post title
description: One sentence summary.
date: 2026-08-14
author: Editor
tags:
  - writing
image: /images/cover.jpg
links:
  - title: Reference
    url: https://example.com
---
```

## Commands

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build |
| `npm run preview` | Preview the build |
