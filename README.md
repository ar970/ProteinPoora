# Protein पूरा — website

Static site for [proteinpoora.shop](https://proteinpoora.shop), hosted on Vercel. Plain HTML, CSS and a few lines of JavaScript, no build step. The structure mirrors Shopify sections so it can be ported to a Liquid theme later.

## Preview locally

Any static server from the repo root works. For example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Paths are absolute (`/assets/...`), so serve from the repo root, not by opening `index.html` directly.

## Deploy to Vercel

Import the repository in Vercel. Framework preset: **Other**. Build command: none. Output directory: `.` (repo root). `vercel.json` sets long-lived caching for `/assets/` and `.vercelignore` keeps the design docs and skills out of the deploy.

## Where things live

| Path | What |
|---|---|
| `index.html` | The page. Sections are marked with `<!-- section: … -->` comments. |
| `assets/css/style.css` | All styles. Tokens at the top match `design-system/proteinpoora/MASTER.md`. |
| `assets/css/fonts.css` | Self-hosted Baloo 2 and DM Sans. |
| `assets/js/main.js` | Mobile menu toggle only. The page works without it. |
| `assets/img/` | Hero pack image (two sizes, WebP with transparency), molecule pattern, favicon. |
| `design-system/` | Design spec: colors, type, spacing, section order, Shopify plan. |

## Swapping the hero image

Export the pack on a transparent background, then save two WebP sizes (about 720 px and 1000–1200 px wide) into `assets/img/` and update the `src`, `srcset`, `width` and `height` on the hero `<img>` in `index.html`, plus the matching `<link rel="preload">` in the head.

## Fonts

The Devanagari font file is subset to the wordmark glyphs (पूरा) only, to keep it at 2 KB. If Hindi text is added anywhere else, replace `assets/fonts/baloo-2-devanagari-wordmark.woff2` with the full Devanagari subset from Google Fonts and keep the `@font-face` block in `fonts.css` as is.
