# Mero Udhyog — Marketing Website

Standalone descriptive website for **Mero Udhyog**, the operating workspace for Nepali factories and distributors (products, orders, deliveries, khata, predictions). Mero Udhyog is a product of **Factoryze Tech**, headquartered in Pepsicola, Kathmandu with a branch office in Itahari, Sunsari.

Fully decoupled from the main app (`../frontend`). Static output — deploy anywhere.

## Stack

- **Astro 5** (static output) + **Tailwind CSS v4**
- **GSAP + ScrollTrigger** — scroll storytelling (hero word reveal, bento stagger, screenshot parallax, chart draw, count-up, pinned stepper, CTA wipe, marquee loop, mouse-tilt hero)
- **Motion (motion.dev)** — micro-interactions (button springs, lifts, pop-in chips, accordion, pulsing CTA)
- **Embla Carousel** — app-screenshot carousel + Unsplash lifestyle carousel
- Self-hosted fonts (`@fontsource`): Instrument Serif (display) + Inter (body)

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview
```

The contact form posts to `POST {PUBLIC_API_URL}/contact`. During
`npm run dev` it defaults to `http://localhost:8000/api/v1`, so start the
local API on port 8000:

```bash
cd ../backend
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

Override the API origin in `website/.env` if needed:

```dotenv
PUBLIC_API_URL="http://localhost:8000/api/v1"
```

Production builds default to `https://api.meroudhyog.com/api/v1`; set
`PUBLIC_API_URL` explicitly in `.env.production` when deploying. The backend
delivers submissions to `CONTACT_EMAIL`, which defaults to
`info.meroudhyog@gmail.com`.

> **Node note:** `npm run check` (`astro check`) needs Node ≥ 22 because the Astro language server ships ESM-only. On Node 20 run it via `npx -y node@22 ./node_modules/astro/astro.js check`. Build/dev work on Node 20.

## Structure

```
src/
├── layouts/BaseLayout.astro      SEO, OG, JSON-LD, nav + footer, scroll progress
├── components/                   Nav, Footer, SectionHeading, Marquee,
│                                 ScreenshotShowcase, LifestyleCarousel
├── content.config.ts             Blog collection schema
├── content/blog/                 Markdown posts
├── lib/motion.ts                 Motion micro-interaction helpers
├── lib/carousel.ts               Embla setup (reads data-embla="…" markup)
├── scripts/animations.ts         GSAP orchestration (data-reveal, data-hero-word, …)
├── styles/global.css             Design tokens + utilities
└── pages/
    ├── index.astro               Landing (product-first bento hero)
    ├── about.astro               About / mission / values
    ├── contact.astro             Contact channels + API-backed message form
    ├── blog/index.astro          Blog index (featured + grid)
    ├── blog/[slug].astro         Article page (MDX via content collection)
    ├── 404.astro
    ├── robots.txt.ts
    └── sitemap.xml.ts            Includes all posts
public/screenshots/               Real app screens (dashboard, orders, products)
public/logo-*.svg                 Logo mark + lockups
```

## Design language (research-backed, 2026 patterns)

- **Product-first hero** — real screenshots in an asymmetric bento grid above the fold (Linear/Vercel pattern)
- **Editorial typography** — `display-xl/lg/md` classes, Instrument Serif, tight tracking, generous whitespace
- **Bento feature grid** — varied tile sizes with visual rhythm, one anchor tile
- **Light ↔ dark section rhythm** and radial glow blobs
- **Motion as information** — masked line reveals, clip-path wipes, amber underline draw, chart path draw, counters, pinned stepper, scroll-progress bar

### Animation hooks (declarative)

| Attribute | Effect |
|---|---|
| `data-reveal` | GSAP fade-up on scroll |
| `data-hero-word` | Hero headline word-by-word reveal |
| `data-bento` | Staggered child entrance |
| `data-shot` | Screenshot parallax + scale-in |
| `data-chart-line` / `data-chart-dot` | Path draw + dot pop |
| `data-count` / `data-suffix` | Count-up on enter |
| `data-stepper` / `data-step` / `data-step-progress` | Pinned scrubbed stepper |
| `data-cta-panel` / `data-cta-rise` | Clip-path wipe + content rise |
| `data-motion="scale\|lift\|pop\|pulse"` | Motion micro-interactions |
| `data-motion-accordion` | details/summary height animation |
| `data-embla` / `data-embla-*` | Embla carousel wiring |
| `data-reveal-mask` | clip-path wipe reveal |
| `data-line-rise` | masked line rising up |
| `data-underline` | amber marker underline draws under accent word |
| `data-scroll-progress` | top reading-progress bar |
| `data-stagger-group` | children fade/slide in sequence |

All animations respect `prefers-reduced-motion` (they set final states instead).

## Content notes

- Product facts (khata FIFO allocation, PAN/credit limits, GPS delivery trails, 8 roles, CSV/XLSX import, per-customer pricing, receipt/bill templates) are taken from the actual app in `../frontend` and `../backend`.
- Predictions are described as **statistics-based forecasts**, not AI — matching `frontend/features/predictions/README.md`.
- Pricing is a **"coming soon"** teaser (no plans defined in the product yet).

## Deploy

Production runs on the Contabo VPS behind Nginx at `https://meroudhyog.com`.
Build with `npm ci && npm run build` and serve `dist/` as a static root. See
`../docs/deployment/README.md` for the full Nginx and TLS setup.

## Adding a blog post

Drop a markdown file in `src/content/blog/` with frontmatter:

```yaml
---
title: "..."
description: "..."
date: 2026-09-20
cover: "https://images.unsplash.com/..."
tag: "Operations"
readingTime: "5 min read"
---
```

It appears automatically in the blog index and sitemap. Article body styling lives in
`blog/[slug].astro` (`.prose-article`).
