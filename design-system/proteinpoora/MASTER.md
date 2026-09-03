# Protein पूरा — Design System (Master)

Source of truth for the Shopify theme. Page-specific overrides live in `pages/`.

## Brief

- **Product**: Roasted Indian protein snacks. Bhujia, ragi chips, peanuts, makhana. 9–14 g protein per 30 g serving. Roasted, never fried. Made in India.
- **Audience**: Urban Indian, 20s–30s, gym and health-aware, still wants namkeen.
- **Page job**: Convert to a paid pre-order of the first batch.
- **Direction**: Keep the existing look (navy / cream / orange, molecule motif, current copy and section order). Raise execution quality, responsiveness, and speed.
- **Platform**: Custom Shopify Online Store 2.0 theme. Liquid + plain CSS + minimal JS. No framework, no build step.

## Color

Derived from the packaging. Database anchor: "Food Delivery" palette (orange + blue on warm cream). Overrode the database's category default (green) because the packs already fix the brand.

| Token | Hex | Role |
|---|---|---|
| `--navy` | `#1E2D78` | Brand field: hero, footer, ticker, primary buttons |
| `--navy-ink` | `#1A2456` | Headings and body-strong on light grounds |
| `--pack-blue` | `#2F63C9` | Links, protein-per-serving line, focus ring |
| `--cream` | `#F7E9C3` | CTA fill on navy, chips, badges |
| `--cream-soft` | `#FBF3DC` | Proof strip and quiet section grounds |
| `--orange` | `#F08A2A` | The one accent: headline second line, eyebrow, protein badge, dots |
| `--paper` | `#FFFFFF` | Page ground |
| `--tile` | `#F3F4F8` | Product image tile behind packs |
| `--text` | `#4A5068` | Body text on light |
| `--line` | `#E4E6EF` | Card and table borders |
| `--error` | `#C4321F` | Form errors |

Contrast (AA, verified by formula): cream on navy 11.8:1, orange on navy 5.4:1, navy-ink on cream-soft 12.9:1, pack-blue on paper 5.9:1, text on paper 7.3:1. Orange is never used for body text on light grounds.

Semantic aliases in CSS: `--color-bg`, `--color-fg`, `--color-brand`, `--color-accent`, `--color-cta`, `--color-cta-fg`, `--color-muted`, `--color-border`.

## Typography

Two families only. Self-hosted WOFF2 in `assets/`, `font-display: swap`, preloaded in `theme.liquid`.

| Role | Face | Weights | Notes |
|---|---|---|---|
| Display + wordmark | **Baloo 2** | 700, 800 | Google Font by Ek Type (Mumbai). Matched Latin + Devanagari, so "Protein पूरा" sets as one voice. Latin + Devanagari subsets. |
| Body + UI + numbers | **DM Sans** (variable) | 400–700 | `font-variant-numeric: tabular-nums` on prices, weights, protein figures, nutrition tables. |

Scale (mobile / ≥1024px), line-height, tracking:

| Style | Size | LH | Weight | Tracking |
|---|---|---|---|---|
| Display (H1) | 40 / 64 px | 1.05 | Baloo 800 | -0.01em |
| H2 | 28 / 40 px | 1.1 | Baloo 800 | -0.01em |
| H3 / card title | 20 / 22 px | 1.2 | Baloo 700 | 0 |
| Body | 16 / 17 px | 1.55 | DM 400 | 0 |
| Small | 14 px | 1.5 | DM 400 | 0 |
| Eyebrow / ticker | 12 / 13 px | 1 | DM 600 | 0.14em, uppercase |
| Price | 20 px | 1 | DM 700 | tabular |
| Protein figure (ledger) | 40 / 56 px | 1 | Baloo 800 | tabular |

Wordmark is live text, not an image: `Protein` (Baloo 700) + `पूरा` (Baloo 800) with an inline SVG swoosh under पूरा.

## Spacing, shape, layout

- Base 4. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Section padding: 64 px mobile, 96 px desktop. Proof strip: 32 / 40.
- Container: max 1200 px; gutters 20 px mobile, 32 px desktop.
- Radius: pill (999) for buttons, chips, badges; 20 px cards; 16 px image tiles; 12 px inputs.
- Shadows: none, except a 1 px `--line` border and a 2 px navy focus ring. Cards lift on hover by border color only.
- Touch targets ≥ 44 × 44. Buttons: 48 px tall mobile, 52 px desktop.
- Breakpoints: 375, 768, 1024, 1440. Mobile first. No horizontal scroll at any width.

## Motion

- One orchestrated moment: the hero (eyebrow → headline → sub → CTAs → pack) fades up in 400 ms, 60 ms stagger, on load.
- Ticker scrolls with a CSS keyframe; pauses on hover/focus; static under `prefers-reduced-motion`.
- Everything else: color and border transitions at 150–200 ms ease-out. No parallax, no scroll-jacking, no animated width/height.

## Signature

**The protein ledger.** The hero's second button, "See the protein numbers", scrolls to a nutrition-panel-style table on navy: one row per snack, protein per 30 g as a large Baloo figure with a cream bar, and the regular fried version beside it for comparison when sourced figures exist. It is the brand's argument drawn the way it appears on the back of the pack. Every number is a section setting; nothing is hardcoded.

The molecule line-art stays as texture on navy fields only (hero, footer, ledger), at 8–12% opacity, as on the pack. It never sits behind body text on light grounds.

## Components

- **Button**: primary = cream fill / navy text (on navy fields), navy fill / cream text (on light). Secondary = 2 px outline. Loading state: disabled + `aria-busy` + label "Adding…". Success label "Added" for 2 s, then "Add to cart".
- **Chip**: cream-soft pill, orange dot, navy-ink text. Informational only, not interactive.
- **Product card**: tile with pack image (aspect 1:1, `--tile` ground), name (H3), tagline (small, muted), protein line (pack-blue, DM 500), price + weight, Add to cart. Whole image + title area is the product link; button is a separate form.
- **Protein badge**: orange circle, cream text, "10 g protein" on two lines. Overlaps pack image top-right.
- **Icons**: inline SVG, Phosphor outline style, 20 px, `aria-hidden` when next to visible text. No emoji as icons.
- **FAQ**: native `<details>/<summary>`. No JS.
- **Forms**: visible labels above fields, error text below the field in `--error`, `inputmode` set for phone/pincode.

## Section order

**Homepage (`index.json`)**
1. Announcement ticker
2. Header (wordmark, Shop, About, cart with count, Pre-order CTA, menu on mobile)
3. Hero (eyebrow, two-line H1, sub, two CTAs, three chips, pack image with protein badge)
4. Proof strip (three facts on cream-soft)
5. Protein ledger
6. The line-up (featured collection, 4 products, "See all")
7. Roasted, never fried (story with image)
8. Pre-order FAQ
9. Footer

**Product page (`product.json`)**: gallery → title + protein figure → price, weight, pre-order note → Add to cart → In this pack (ingredients) → Nutrition (per 100 g / per 30 g) → How it's made → You might also like.

**Collection (`collection.json`)**: heading, optional intro, product grid. No filters needed at 4 products.

**Cart (`cart.json`)**: line items with pack image, qty stepper, remove, subtotal, pre-order dispatch note, Checkout.

**Pages**: About (story), FAQ, Contact. Plus required 404, search, password, customer templates kept minimal and on-brand.

## Shopify architecture

```
layout/theme.liquid
templates/*.json, gift_card.liquid, customers/*
sections/   announcement-ticker, header, hero, proof-strip, protein-ledger,
            featured-collection, story, faq, footer,
            main-product, main-collection, main-cart, main-page, main-404,
            main-search, main-password, main-list-collections
snippets/   product-card, price, icon, wordmark, molecule-pattern, responsive-image
assets/     base.css, theme.js, fonts (woff2)
config/     settings_schema.json, settings_data.json
locales/    en.default.json, en.default.schema.json
```

- All copy, numbers, and images are section/block settings so they're editable in the theme editor.
- Product images come from Shopify product media, rendered with `image_url` + `srcset` + `sizes`; `loading="lazy"` everywhere except the hero pack (`fetchpriority="high"`).
- Nutrition and ingredients read from product metafields (`custom.ingredients`, `custom.nutrition_per_100g`, `custom.nutrition_per_30g`, `custom.protein_per_30g`).
- JS is one file under 8 KB: menu toggle, add-to-cart via `/cart/add.js` with fallback to the plain form post, cart count update. Everything works with JS disabled.

## Performance budget

- CSS ≤ 30 KB, JS ≤ 8 KB, fonts ≤ 120 KB total (3 files).
- LCP ≤ 2.0 s on a mid-range phone over 4G. CLS < 0.1: every image has width/height or aspect-ratio.
- No third-party scripts in the theme. No web font from a CDN.

## Pre-orders and admin

The shop pages stay static. Three serverless functions in `api/` sit beside
them, and the split between what they own and what the markup owns is the same
split Shopify enforces:

- **The database owns commerce**: name, slug, price, pack size, protein figure,
  availability, sort order. These become Shopify product fields.
- **The markup owns the story**: photography, ingredients, allergens, the
  nutrition tables, the flavour copy. These become theme sections and
  metafields.

Nothing that a customer reads as *content* goes in the database, because none of
it would survive the port. Nothing that changes with a business decision stays
hardcoded in HTML, because the admin has to be able to change it.

The cart lives in `localStorage` under `pp_cart_v1` and is display state only:
names and prices are cached there so the drawer paints instantly, and the server
re-prices every line on write. `/preorder` is the checkout, and its picker is the
cart's editor rather than a second source of truth. On Shopify this file is
replaced by `/cart.js` and the theme's cart drawer, which is why the drawer
markup is shaped like one.

Rules that hold regardless of storage:

- Money is stored as an integer number of **paise**. Never a float.
- The browser sends slugs and quantities. **The server prices the order**, on
  write, from the products table. A client-supplied amount is ignored.
- Each order stores its own copy of its line items and their prices, so editing
  or deleting a product never rewrites an order already placed.
- Admin credentials come from environment variables and never from the
  repository, which is public.

Full setup and behaviour: `docs/ADMIN-SETUP.md`.

## Caching on Vercel — the rename rule

`vercel.json` serves `/assets/fonts/` and `/assets/img/` as
`max-age=31536000, immutable`. That is only safe while **a URL's bytes never
change**. Re-exporting artwork over an existing filename does not reach anyone
who has already loaded the page — their browser and the Vercel edge both keep
the old copy for a year, and no redeploy can evict it.

So when new artwork replaces an existing image:

- **Rename the file**, don't overwrite it — append `-v2`, `-v3`, … before the
  extension (`korean-bbq-peanuts-pack-720-v2.webp`), then rewrite every
  reference. A new URL is the only thing a cached browser will refetch.
- CSS and JS are `must-revalidate` instead, so those stay on `?v=N` query
  params in the `<link>`/`<script>` tags.

On Shopify this problem disappears: `asset_url` appends its own `?v=` stamp
whenever the asset changes, so the Liquid port drops the `-vN` suffixes and
lets the platform version the URLs.

## Pre-delivery checklist

- [ ] No emoji as icons (inline SVG only)
- [ ] `cursor: pointer` on all clickable elements
- [ ] Hover and focus states with 150–200 ms transitions
- [ ] Text contrast ≥ 4.5:1 on every ground
- [ ] Visible focus ring for keyboard nav
- [ ] `prefers-reduced-motion` respected (ticker static, hero no stagger)
- [ ] Responsive at 375, 768, 1024, 1440, no horizontal scroll
- [ ] Every image has alt text; decorative ones `alt=""`
- [ ] Header height compensated so it never hides content
- [ ] Shopify Theme Check passes with no errors
