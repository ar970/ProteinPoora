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
| `index.html` | Homepage: ticker, header, hero, the line-up, footer. Sections are marked with `<!-- section: … -->` comments. |
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
| `assets/js/tear.js` | The line-up packs that tear open on hover. |
| `assets/img/bits/` | The snack cut-outs that spill out of a torn pack, cut from the product photography by `scripts/extract-pieces.py`. |
| `scripts/dev-server.js` | Local server that mounts the real API handlers. |
| `design-system/` | Design spec: colors, type, spacing, section order, Shopify plan. |

## Swapping the hero image

Export the pack on a transparent background, then save two WebP sizes (about 720 px and 1000–1200 px wide) into `assets/img/` and update the `src`, `srcset`, `width` and `height` on the hero `<img>` in `index.html`, plus the matching `<link rel="preload">` in the head.

## Adding product snapshots

Snapshots live in the gallery on the product page. To add one:

1. Export it as WebP at 600 px and 1200 px wide (square works best) into `assets/img/`, named like `masala-bhujia-snap-2-600.webp` and `masala-bhujia-snap-2-1200.webp`.
2. In `products/masala-bhujia/index.html`, copy one of the `<li>` blocks inside `<ul class="thumbs">` and point its `data-src`, `data-srcset`, `data-large`, `data-alt` and the thumbnail `<img>` at the new files.

Clicking a thumbnail swaps the main image; clicking the main image opens it full-size. Left and right arrow keys move between photos.

## Packs that tear open

Hovering a line-up card rips the top off the pouch and throws the snack out of it. Each pack spills its own contents — bhujia strands, chilli slices, cheese cubes, peanuts.

The pack is not a second photograph. `assets/js/tear.js` clones the card's existing `<img>` twice and clips the copies along the same ragged line, one keeping what is above it and one what is below, so they fit together invisibly and come apart when torn. Cloning costs no download. Nothing is built until a card is first hovered, so a visitor who never hovers never fetches a piece; once the pack closes again the halves come back out of the page and the original `<img>` goes back in, leaving the card exactly as it shipped.

The card is tagged in `index.html`:

```html
<div class="product-card__media" data-tear="masala-bhujia" data-bits="6">
```

`data-tear` is the slug, and the pieces are `assets/img/bits/<slug>-1.webp` … `-<data-bits>.webp`. To add a pack, add cut-outs under that naming and tag its media box.

Where there is no hover (a phone), each pack tears open once, the first time it is scrolled to, and closes itself after two seconds. Under `prefers-reduced-motion: reduce` nothing is built at all.

To cut pieces from a new photo, add a source and its boxes to `scripts/extract-pieces.py` and run it — it keys each box against its own local background and keeps the largest blob, so give it a box with a margin of background around the piece.

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
