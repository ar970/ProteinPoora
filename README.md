# Protein पूरा — website

Storefront for [proteinpoora.shop](https://proteinpoora.shop), hosted on Vercel. The shop pages are plain HTML, CSS and a little JavaScript with no build step; three serverless functions in `api/` take pre-orders and back the admin panel. The structure mirrors Shopify sections so it can be ported to a Liquid theme later.

## Preview locally

The shop pages are static, but `/preorder` and `/admin` need the API, so use the dev server — it routes `/api/*` to the same handlers Vercel runs:

```bash
npm install
DATABASE_URL='postgres://…' ADMIN_USERNAME='archit' ADMIN_PASSWORD='…' node scripts/dev-server.js
# then open http://127.0.0.1:3000
```

Paths are absolute (`/assets/...`), so serve from the repo root, not by opening `index.html` directly. See [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) for the database and credentials.

## Deploy to Vercel

Import the repository in Vercel. Framework preset: **Other**. Build command: none. Output directory: `.` (repo root). `vercel.json` sets long-lived caching for `/assets/` and `.vercelignore` keeps the design docs and skills out of the deploy.

## Where things live

| Path | What |
|---|---|
| `index.html` | Homepage: ticker, header, hero, the line-up, FAQ, footer. Sections are marked with `<!-- section: … -->` comments. |
| `products/masala-bhujia/index.html` | Product page: gallery with lightbox, buy box, nutrition table. Served at `/products/masala-bhujia`. |
| `assets/css/style.css` | All styles. Tokens at the top match `design-system/proteinpoora/MASTER.md`. |
| `assets/css/fonts.css` | Self-hosted Baloo 2 and DM Sans. |
| `assets/js/main.js` | Menu toggle, gallery, hero carousel, scroll reveal. The pages work without it. |
| `assets/img/` | Pack shots and lifestyle photos (WebP, two sizes each, transparent backgrounds), logo and favicons. Re-exported artwork is **renamed**, never overwritten — see the caching note in `design-system/proteinpoora/MASTER.md`. |
| `preorder/index.html` | Pre-order form: product picker, customer details, address. Served at `/preorder`. |
| `admin/index.html` | Admin panel, linked from every footer. Served at `/admin`. |
| `api/` | Serverless functions: `products.js`, `preorders.js`, `admin.js`, plus shared `_lib/`. |
| `assets/css/admin.css` | Admin panel styles. Loaded only by `/admin`. |
| `assets/js/cart.js` | Cart state, header count and drawer. Loaded on every storefront page. |
| `assets/js/preorder.js`, `assets/js/admin.js` | Page scripts for the checkout and the admin panel. |
| `sources/open/` | Photographs of each pack torn open with its contents flying, as shot. Nothing on the site uses them; kept out of the deploy by `.vercelignore`. |
| `scripts/dev-server.js` | Local server that mounts the real API handlers. |
| `design-system/` | Design spec: colors, type, spacing, section order, Shopify plan. |

## Swapping the hero image

Export the pack on a transparent background, then save two WebP sizes (about 720 px and 1000–1200 px wide) into `assets/img/` and update the `src`, `srcset`, `width` and `height` on the hero `<img>` in `index.html`, plus the matching `<link rel="preload">` in the head.

## Adding product snapshots

Snapshots live in the gallery on the product page. To add one:

1. Export it as WebP at 600 px and 1200 px wide (square works best) into `assets/img/`, named like `masala-bhujia-snap-2-600.webp` and `masala-bhujia-snap-2-1200.webp`.
2. In `products/masala-bhujia/index.html`, copy one of the `<li>` blocks inside `<ul class="thumbs">` and point its `data-src`, `data-srcset`, `data-large`, `data-alt` and the thumbnail `<img>` at the new files.

Clicking a thumbnail swaps the main image; clicking the main image opens it full-size. Left and right arrow keys move between photos.

## FAQ

Ten questions on the homepage at `#faq`, which the header and every footer already linked to. Built from `<details>`/`<summary>` on the same `.acc` accordion the product pages use, so it opens and closes with no JavaScript at all and keeps working with scripts off.

Every answer is taken from something the site already states — the protein figures and claims on the cards, the ingredient and allergen panels on the product pages, the storage line, and what `/preorder` promises ("we will email to confirm, nothing has been charged"). If you change one of those, change the answer with it.

Two answers are deliberately vague because the facts are not settled: there is no shipping date, and there is no contact address anywhere on the site, so "can I cancel" says to quote the `PP-` reference rather than naming an inbox. Both are worth firming up.

## Meta Pixel

The pixel (`1712138209892288`) fires a `PageView` on all seven storefront pages: the homepage, `/preorder` and the five product pages. The script sits at the end of each page's `<head>`; the `<noscript>` fallback image sits at the top of `<body>`, because inside `<head>` a `<noscript>` may only hold `link`, `style` and `meta` — an `<img>` there is invalid HTML.

**It is deliberately not on `/admin`.** Meta's automatic advanced matching reads form fields on the page and sends them hashed, and the admin panel exists to display other people's names, phone numbers and addresses. There is no advertising value in tracking your own admin sessions either.

There is no build step, so the block is repeated on each page — the same as the header, ticker and footer. In a Liquid theme all of them collapse into `theme.liquid`, with the pixel id coming from a theme setting.

The base code reports page views only. **Nothing reports an add to cart or a completed pre-order**, so the pixel cannot yet optimise or attribute ads — that needs `AddToCart` on the cart buttons and `Purchase`/`Lead` on the pre-order confirmation.

## Pre-orders and the admin panel

**Add to cart** on the line-up cards and product pages fills a cart held in the
browser's `localStorage`, so it survives moving between pages. The header shows
a count and opens a drawer for a quick look; `/preorder` is the checkout, and
its picker is the cart's editor — changing a quantity there changes the cart.
Placing an order empties it. Orders land in Postgres and you manage them at
`/admin`, linked from the footer of every page.

Both add-to-cart buttons are links to `/preorder`, so they still do something
sensible with JavaScript off; the cart script intercepts the click when it is
on.

Signing in to `/admin` works as soon as the site deploys, using the built-in
`archit` / `proteinpoora123`. Those are in the source of a **public**
repository, so change them once you are up and running: set `ADMIN_PASSWORD`
in the Vercel project and redeploy — the environment always overrides the
built-in values. The panel shows a banner until you do.

Storing pre-orders still needs a database connected to the project; until then
`/preorder` says so rather than taking an order it cannot keep.
**[docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) has the steps.**

There is no payment step. The form takes a list of interested customers before
the first batch is ready; taking money is a job for the Shopify store.

## Fonts

The Devanagari font file is subset to the wordmark glyphs (पूरा) only, to keep it at 2 KB. If Hindi text is added anywhere else, replace `assets/fonts/baloo-2-devanagari-wordmark.woff2` with the full Devanagari subset from Google Fonts and keep the `@font-face` block in `fonts.css` as is.
