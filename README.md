# Protein पूरा — website

Storefront for [proteinpoora.shop](https://proteinpoora.shop), hosted on Vercel. The shop pages are plain HTML, CSS and a little JavaScript with no build step; orders go straight to Supabase, with two serverless functions in `api/` as a fallback. The structure mirrors Shopify sections so it can be ported to a Liquid theme later.

## Preview locally

The shop pages are static. Orders go straight to Supabase, so a plain file server is enough for most work; use the dev server when you want `/api/*` running too:

```bash
npm install
DATABASE_URL='postgres://…' node scripts/dev-server.js
# then open http://127.0.0.1:3000
```

Paths are absolute (`/assets/...`), so serve from the repo root, not by opening `index.html` directly. See [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) for the Supabase table.

## Deploy to Vercel

Import the repository in Vercel. Framework preset: **Other**. Build command: none. Output directory: `.` (repo root). `vercel.json` sets long-lived caching for `/assets/` and `.vercelignore` keeps the design docs and skills out of the deploy.

## Where things live

| Path | What |
|---|---|
| `index.html` | Homepage: ticker, header, hero, proof strip, the line-up, protein ledger, combos, FAQ, footer. Sections are marked with `<!-- section: … -->` comments. |
| `products/masala-bhujia/index.html` | Product page: gallery with lightbox, buy box, nutrition table. Served at `/products/masala-bhujia`. |
| `assets/css/style.css` | All styles. Tokens at the top match `design-system/proteinpoora/MASTER.md`. |
| `assets/css/fonts.css` | Self-hosted Baloo 2 and DM Sans. |
| `assets/js/main.js` | Menu toggle, gallery, hero carousel, scroll reveal. The pages work without it. |
| `assets/img/` | Pack shots and lifestyle photos (WebP, two sizes each, transparent backgrounds), logo and favicons. Re-exported artwork is **renamed**, never overwritten — see the caching note in `design-system/proteinpoora/MASTER.md`. |
| `preorder/index.html` | Pre-order form: product picker, customer details, address. Served at `/preorder`. |
| `thank-you/index.html` | Where a placed order lands. Served at `/thank-you`; `noindex`, so it stays out of search. |
| `api/` | Serverless functions: `products.js` and `preorders.js`, plus shared `_lib/`. Only used when Supabase is not configured. |
| `assets/js/cart.js` | Cart state, header count and drawer. Loaded on every storefront page. |
| `assets/js/preorder.js` | The checkout: picker, validation, and posting the order. |
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

## The warm hero

The hero, its ticker and its header run on a warm sand ground taken from the
brand mockup. **Everything below the fold keeps navy, cream and orange** — the
two sets of inks are not interchangeable, and the tokens say so: `--cream` and
friends only work on navy, `--cocoa`, `--umber`, `--rust` and `--bronze` only
work on sand. `design-system/proteinpoora/MASTER.md` has the table and the
measured contrast.

Two things fall out of the light ground and are worth knowing before changing
anything here:

**The product accent is no longer used for text.** Four of the five accents
fall below 4.5:1 on sand, so the eyebrow, the headline's second line and the
product name are fixed inks, and the protein badge is a fixed rust disc. The
accent still follows the product everywhere it is not text — the card wash, the
chip dots, the carousel glow and the dot fill. **The wash is capped at 12%**:
past about 14% the eyebrow stops clearing 4.5:1 on the lighter accents.

**The seal watermark is painted through a mask.** The artwork
(`logo-seal-cream.png`) is cream marks on transparent, which was right on navy
and invisible on sand, so it is used as a `mask` and filled with `--bronze`
instead. Where masks are unsupported the seals do not render at all, rather
than showing up as tan squares.

`.wordmark`, `.cart-button` and `.lightbox__btn` are the three places where the
same component appears on both grounds. The wordmark defaults to cream for the
navy footer and is overridden inside `.site-bar`; the lightbox button stays
cream because its overlay is dark. Check those three after any header change.

## The header

`<div class="site-bar" data-site-bar>` sits **outside `<main>`** on every page
and is `position: sticky`. It used to live inside the hero's navy card, so past
the fold there was no cart, no nav and no pre-order button anywhere on the page.

It has two states. At rest it is transparent and the hero reads as one
unbroken field. Once the page has scrolled past the hero's top it takes
`.is-stuck` — the hero's own sand, a shadow, and slightly tighter padding — so
the links stay legible over the cream, white and navy sections below. The state
is driven by an IntersectionObserver watching a 90px sentinel at the top of
`<body>`, not a scroll listener; with no IntersectionObserver the bar is simply
always solid.

**The stuck ground is sand, not navy, so the header's ink never flips.** A bar
that changed from dark text to light halfway down the page is one more thing to
get wrong on every element in it — the wordmark, three nav links, the cart
button and its count, the menu toggle and the CTA. One set of inks, both states.

The hero card is pulled up under the bar (`.site-bar + main > .hero-frame`), so
its rounded corner starts at the top of the viewport rather than below the
header. If the header's height changes, the two `74px`/`82px` figures there
change with it.

In a Liquid theme this is one `header.liquid` section with a "sticky" setting,
included from `theme.liquid` above `{{ content_for_layout }}`.

## Homepage structure

The grounds alternate — sand hero, cream proof strip, white line-up, navy
ledger, cream combos, white FAQ, navy footer. Two navy sections used to sit
next to each other and read as one slab; the proof strip is what breaks them.

The hero was navy until the warm ground replaced it, which leaves three pale
grounds in a row at the top of the page. They are separated by the hero card's
rounded edge and the white gutter around it rather than by contrast. It holds,
but it is the weakest seam on the page.

**The line-up is five across on wide screens and a swipe rail below that.**
Five products never divided into three columns: the old grid stranded two
cards beside a hole, and stacked to 3,400px on a phone. The rail puts the
whole line-up in one gesture — that section is 674px on a phone now.

**The protein ledger** (`#protein`) is the signature named in the design
system and never built until now: one row per snack, protein per pack as a
large figure, and a bar scaled to the largest of the five so they are
comparable without reading a number. It uses our own figures only. Adding the
"regular fried snack" comparison column needs sourced numbers — do not invent
them.

**Cards carry six things**, not nine: pack, name, one line, protein + weight,
price, button. A three-column stats table and a row of claim chips were cut;
their labels had shrunk to 9px, and a 7px "Per pack" sat under the badge.
Calories and the claims are on the product pages, where someone reads them.

Nothing on the page draws a box shadow, and there are five corner radii. Both
are what the design system always said; the built site had drifted.

## Combos

Three bundles at `#combos`, between the line-up and the FAQ:

| Slug | Name | Price | Singles | Saving |
|---|---|---|---|---|
| `combo-all-five` | Poora Family Pack | ₹429 | ₹500 | ₹71 |
| `combo-bhujia-duo` | Bhujia Duo | ₹170 | ₹198 | ₹28 |
| `combo-chakli-duo` | Chakli Duo | ₹150 | ₹178 | ₹28 |

They are ordinary cart items, not a discount rule: a combo has its own slug and
its own price, so nothing has to reason about what is in a basket. Each one is
in two places and both must agree — the card's `data-price-paise` in
`index.html`, and the `#catalogue` JSON in `preorder/index.html` that the
checkout picker and the order both read. **Change a price and change it in
both.** The saving on the two duos is the singles total minus the combo price. The
Family Pack strikes out ₹500 rather than the ₹475 its five singles come to, so
its saving is set against that; keep the two numbers in step if either moves.

The cards are wide where the line-up's are tall, because the bundle photography
is landscape and the packs in it are the point. The five-pack shot is the widest
of the three, so its card spans the grid.

There are no product pages for combos, and no nutrition panels: each one is
just its packs, which have their own pages.

**They are not in the Postgres `products` table.** That only matters on the API
fallback (`api/preorders.js` re-prices from it and would reject an unknown
slug), which is dormant while orders go to Supabase. If that route is ever
switched back on, add the three rows first.

## FAQ

Ten questions on the homepage at `#faq`, which the header and every footer already linked to. Built from `<details>`/`<summary>` on the same `.acc` accordion the product pages use, so it opens and closes with no JavaScript at all and keeps working with scripts off.

Every answer is taken from something the site already states — the protein figures and claims on the cards, the ingredient and allergen panels on the product pages, the storage line, and what `/preorder` promises ("we will email to confirm, nothing has been charged"). If you change one of those, change the answer with it.

Two answers are deliberately vague because the facts are not settled: there is no shipping date, and there is no contact address anywhere on the site, so "can I cancel" asks people to get in touch with the name and number they ordered with, rather than naming an inbox. Both are worth firming up.

## Meta Pixel

The pixel (`1712138209892288`) fires a `PageView` on all seven pages: the homepage, `/preorder` and the five product pages. The script sits at the end of each page's `<head>`; the `<noscript>` fallback image sits at the top of `<body>`, because inside `<head>` a `<noscript>` may only hold `link`, `style` and `meta` — an `<img>` there is invalid HTML.

There is no build step, so the block is repeated on each page — the same as the header, ticker and footer. In a Liquid theme all of them collapse into `theme.liquid`, with the pixel id coming from a theme setting.

The base code reports page views only. **Nothing reports an add to cart or a completed pre-order**, so the pixel cannot yet optimise or attribute ads — that needs `AddToCart` on the cart buttons and `Purchase`/`Lead` on the pre-order confirmation.

## Pre-orders

**Add to cart** on the line-up cards and product pages fills a cart held in the
browser's `localStorage`, so it survives moving between pages. The header shows
a count and opens a drawer for a quick look; `/preorder` is the checkout, and
its picker is the cart's editor — changing a quantity there changes the cart.
Placing an order empties the cart and sends the customer to **`/thank-you`**,
its own page: a thank you and one button home, nothing else. It is a real URL
rather than a panel swapped in on `/preorder`, so a completed pre-order is a
page view Meta and any analytics can count. The redirect is `location.replace`,
so Back does not return to a filled-in form whose order has already gone in.

**Orders are read in Supabase**, in its own Table Editor, by whoever is signed
in to that project. There is no admin page on this site: one would have to hold
a password in a public repository and would put customer names, phone numbers
and addresses behind it. Supabase already does the job, with real accounts.

Both add-to-cart buttons are links to `/preorder`, so they still do something
sensible with JavaScript off; the cart script intercepts the click when it is
on.

**The PIN code box only accepts digits**, six of them — anything else is stripped as it is typed, including out of a paste, and the caret is put back where it was rather than jumping to the end. Submitting still checks the whole thing (`[1-9]` then five digits: an Indian PIN never starts with a zero), and `docs/supabase-setup.sql` now carries the same rule as a database constraint, because the form is not the guard — anyone can post to that table with the public key. If your table already exists, the bottom of that file has the one `alter table` to add it.

**Typing a city fills the state in.** `CITY_STATE` in `assets/js/preorder.js` maps about 150 Indian cities to their state, old names included, since people still type Bangalore and Bombay. Names that belong to more than one state — Aurangabad, Bilaspur — are deliberately absent: a wrong state posted quietly is worse than an empty one. It never writes over a state the customer chose themselves, and the moment they touch the dropdown it stops guessing.

Storing pre-orders needs the Supabase table in place; until then `/preorder`
says so rather than taking an order it cannot keep.
**[docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) has the steps.**

There is no payment step. The form takes a list of interested customers before
the first batch is ready; taking money is a job for the Shopify store.

## Fonts

The Devanagari font file is subset to the wordmark glyphs (पूरा) only, to keep it at 2 KB. If Hindi text is added anywhere else, replace `assets/fonts/baloo-2-devanagari-wordmark.woff2` with the full Devanagari subset from Google Fonts and keep the `@font-face` block in `fonts.css` as is.
