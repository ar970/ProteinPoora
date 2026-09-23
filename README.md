# Protein पूरा — website

Storefront for [proteinpoora.shop](https://proteinpoora.shop), hosted on Vercel. The shop pages are plain HTML, CSS and a little JavaScript with no build step. Orders are **paid, through Razorpay**: two serverless functions in `api/` create and verify the payment, and the order row then goes to Supabase. Two more functions are a dormant database fallback. The structure mirrors Shopify sections so it can be ported to a Liquid theme later.

## Preview locally

The shop pages are static, but **checkout needs `/api/*` running**, so use the dev server:

```bash
npm install
cp .env.example .env     # then paste your Razorpay keys in
npm run dev              # → http://127.0.0.1:3000
```

The dev server reads `.env` the way Vercel reads its environment variables, and mounts the real handlers — nothing in it is a stub. With no keys set, checkout returns `503` and says so rather than placing an unpaid order.

Paths are absolute (`/assets/...`), so serve from the repo root, not by opening `index.html` directly. See [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) for the Supabase table, and **Payments** below for the checkout.

## Deploy to Vercel

Import the repository in Vercel. Framework preset: **Other**. Build command: none. Output directory: `.` (repo root). `vercel.json` sets long-lived caching for `/assets/` and `.vercelignore` keeps the design docs and skills out of the deploy.

**Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the Vercel project's environment variables before deploying.** They are not in the repository and cannot be — without them the deployed checkout returns `503` and takes no orders.

## Where things live

| Path | What |
|---|---|
| `index.html` | Homepage: ticker, header, hero, proof strip, the line-up, combos, FAQ, footer. Sections are marked with `<!-- section: … -->` comments. |
| `products/masala-bhujia/index.html` | Product page: gallery with lightbox, buy box, nutrition table. Served at `/products/masala-bhujia`. |
| `assets/css/style.css` | All styles. Tokens at the top match `design-system/proteinpoora/MASTER.md`. |
| `assets/css/fonts.css` | Self-hosted Baloo 2 and DM Sans. |
| `assets/js/main.js` | Menu toggle, gallery, hero carousel, scroll reveal. The pages work without it. |
| `assets/img/` | Pack shots and lifestyle photos (WebP, two sizes each, transparent backgrounds), logo and favicons. Re-exported artwork is **renamed**, never overwritten — see the caching note in `design-system/proteinpoora/MASTER.md`. |
| `preorder/index.html` | Order form: product picker, customer details, address. Served at `/preorder`. |
| `thank-you/index.html` | Where a placed order lands. Served at `/thank-you`; `noindex`, so it stays out of search. |
| `api/` | Serverless functions. `create-order.js` and `verify-payment.js` are the payment path and are always used; `products.js` and `preorders.js` are the dormant database fallback. Shared helpers in `_lib/`. |
| `assets/js/cart.js` | Cart state, header count and drawer. Loaded on every storefront page. |
| `assets/js/preorder.js` | The checkout: picker, validation, payment, and posting the order. |
| `assets/js/payment.js` | Razorpay Standard Checkout: create order, open the modal, verify the payment. |
| `sources/open/` | Photographs of each pack torn open with its contents flying, as shot. Nothing on the site uses them; kept out of the deploy by `.vercelignore`. |
| `scripts/dev-server.js` | Local server that mounts the real API handlers and reads `.env`. |
| `api/payment-status.js` | `GET /api/payment-status` — whether checkout is configured, test or live, and with `?check=1` whether Razorpay actually accepts the pair. Never echoes a key. |
| `scripts/check-prices.js` | Fails if the three places prices are written down stop agreeing. |
| `scripts/test-payments.sh` | The payment endpoints, checked with curl. |
| `scripts/check-assets.js` | Fails if one page asks for a different `?v=` of an asset than another. |
| `scripts/check-supabase.mjs` | Whether the orders table can actually take an order. |
| `design-system/` | Design spec: colors, type, spacing, section order, Shopify plan. |

## Weight, and why it is what it is

Measured at 390px, the width of a cheap Android, with the dev server:

| Page | Before | Now |
|---|---|---|
| Homepage (3x screen) | 2,364 KB | 2,267 KB |
| Homepage (2x, most phones) | — | 1,176 KB |
| `/preorder` | 1,441 KB | 631 KB |
| Product page | 1,030 KB | 844 KB |

Four things were wrong, and they are the four to check first if it regresses:

**The hero preload and the hero `<img>` described different layout slots.** The
preload said `520px`, the element said `360px`, so the browser fetched one
candidate up front and the element then chose the other — the same pack
downloaded twice on every homepage load. `imagesizes` and `sizes` must stay
identical; that is the whole point of a preload.

**The carousel loaded all five pouches.** Four of them are invisible on a phone
and dimmed behind the active one on a desktop, but `opacity: 0` does not stop a
download. They are `data-src` now and `main.js` fetches one when it comes within
reach of being seen, then widens that reach on idle so a swipe never waits.
**`.showcase__pack[data-src]` is hidden**, so an un-fetched slide shows nothing
rather than its alt text. With scripting off you get the one pack the hero was
built around, which is the honest fallback for a script-driven carousel.

**Thumbnails were full pack shots.** The checkout picker renders them at 56px
and the product gallery at 64px; both were being handed 720px files. 894 KB of
picker thumbnails became 95 KB, and 1,039 KB of gallery thumbnails became 129 KB.

**The line-up cards claimed `88vw`.** They are a swipe rail, so a card is about
230px wide whatever the viewport and its image lands at 182px. The honest
`sizes="200px"` plus a new 420px variant stopped phones taking the 1050px file
for a card the width of a matchbox.

Re-encoding the pack shots is **not** worth it — at q=82 they come down 7% and
below that the edges go. They were already exported properly.

## Caching, and the one thing that can go wrong with it

`/assets/(css|js)/` is served `immutable` for a year. That is safe because the
`?v=` in every URL is what busts it: a changed asset is a changed URL. It was
`must-revalidate`, which cost every visitor a conditional request per file —
five round trips before the page could render, on a connection where round
trips are the expensive part.

The failure that buys is a **partial bump**: one page updated and another left
behind, so a browser holds last week's stylesheet against this week's markup
for as long as it likes. Fresh browsers never see it, so it does not show up in
testing. `npm run check:assets` fails when one asset carries two versions, and
**`npm run check` runs it with the price check**. Run it before you deploy.

## Is Supabase actually ready?

```bash
npm run check:supabase            # read-only, safe against production
node scripts/check-supabase.mjs --write   # also places and deletes a test order
```

It reads the project URL and anon key out of `assets/js/store-config.js`, so it
checks the table the website really writes to, and it reports three things: that
every column the checkout sends exists, that the table refuses a non-Bengaluru
PIN by itself, and — with `--write` — that a valid order inserts.

This matters more than it sounds. The customer pays through Razorpay **and only
then** does the browser write the order row. A missing column or an unapplied
policy means the money is taken and the order is not recorded, and nothing
tells you until it happens to a real person. `--write` leaves its test row
behind unless `SUPABASE_SERVICE_ROLE_KEY` is set, because the public key may
insert and nothing else; it prints the reference so you can delete it.

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

Sand hero, cream proof strip, white line-up, cream combos, white FAQ, navy
footer.

**The grounds no longer alternate, and that is worth knowing before adding
anything.** They used to: a navy hero and a navy protein ledger were the two
dark moments with pale sections breathing between them. The hero went warm and
the ledger was removed, so everything above the footer is now pale, separated
by card edges and white gutters rather than by contrast. It reads, but the page
has no dark anchor until its last section. If a section ever needs to carry
weight, making the proof strip the dark one is the move — it is four white
cards on cream now, so inverting it would be a background swap rather than a
rebuild.

**The proof strip leads with the figure, not the icon.** It used to be three
centred captions with a 24px line icon floating above each — the shape every
template ships with, and one of those icons was a credit card sitting over
"Never deep fried". It is four cards now (`9–18 g`, `Never`, `0%`, `100%`),
left-aligned, each with a label and one supporting line. The icon sits small in
a tinted tile and is there to be recognised, not to carry the meaning: at 24px
a line icon can say "something crossed out" and little else, which is why the
two negative claims are the crossed-out ones and the number does the talking.

Its four claims are the four on the packs, so the strip and the photography say
the same thing. Adding a fifth means the row wraps 4+1 on wide screens — pick a
replacement instead.

**The line-up is five across on wide screens and a swipe rail below that.**
Five products never divided into three columns: the old grid stranded two
cards beside a hole, and stacked to 3,400px on a phone. The rail puts the
whole line-up in one gesture — that section is 674px on a phone now.

**Cards carry six things**, not nine: pack, name, one line, protein + weight,
price, button. A three-column stats table and a row of claim chips were cut;
their labels had shrunk to 9px, and a 7px "Per pack" sat under the badge.
Calories and the claims are on the product pages, where someone reads them.

Nothing on the page draws a box shadow, and there are five corner radii. Both
are what the design system always said; the built site had drifted.

## Combos and boxes

**There are two ways to buy and they price differently.** A combo is a product
with its own slug and its own fixed price. A box is five or more loose packs,
any mix, at a flat ₹90 each. A loose pack on its own is not sold at all — below
five it is refused, not discounted.

Three bundles at `#combos`, between the line-up and the FAQ:

| Slug | Name | Price | Struck out |
|---|---|---|---|
| `combo-all-five` | Poora Family Pack | ₹450 | ₹495 |
| `combo-bhujia-duo` | Bhujia Duo | ₹170 | ₹198 |
| `combo-chakli-duo` | Chakli Duo | ₹150 | ₹198 |

They are ordinary cart items, not a discount rule: a combo has its own slug and
its own price, so nothing has to reason about what is in a basket. Each one is
in two places and both must agree — the card's `data-price-paise` in
`index.html`, and the `#catalogue` JSON in `preorder/index.html` that the
checkout picker and the order both read. **Change a price and change it in
both.** The struck-out figure is the singles total and nothing else — ₹99 + ₹99
for the Bhujia Duo, ₹99 + ₹99 for the Chakli Duo, ₹495 for all five. It used to
be a round ₹500 on the Family Pack with a "Save ₹61" badge beside it; the badge
is gone and the number is the real sum, because a struck-out price that matches
no actual total is a claim the packs do not support. If a single's price moves,
these move with it.

The cards are wide where the line-up's are tall, because the bundle photography
is landscape and the packs in it are the point. The five-pack shot is the widest
of the three, so its card spans the grid.

### Build your own box

`#build-a-box`, between the combos and the FAQ. Five pack cards, a five-pip
progress track, a running count and total, and a button that stays off until
the box reaches five. The checkout picker builds the same box from the other
end, under its own heading.

Each card shows **one control at a time**: `Add` until there is something in
the box, then a stepper. The swap is the confirmation that the tap landed,
which is why there is no toast — and it means focus has to be moved by hand
when a control disappears, onto the `+` after an add and back onto `Add` when
a stepper reaches zero. Five pips rather than a percentage bar, because five is
small enough to count at a glance; they turn green past the minimum and stop
competing with the total. The one `navigator.vibrate` fires when the box
becomes orderable and nowhere else.

The grid is explicit counts — two, three, five — not `auto-fit`: at 390px the
panel's inner width is a few pixels short of two 150px tracks, and `auto-fit`
silently drops to one card per row. Below 768px the bar is sticky, so the
count, the total and the button follow you past the fold.

Two numbers define it, and both live in `api/_lib/catalogue.js`:
`BOX_RATE_PAISE` (9000) and `BOX_MIN_PACKS` (5). The minimum is enforced in four
places, on purpose:

| Where | What it does |
|---|---|
| `index.html` `data-box-min` | the button will not enable below it |
| `assets/js/cart.js` `BOX_MIN` | the drawer refuses to link to the checkout |
| `assets/js/preorder.js` | the pay button is off and says how many short |
| `api/_lib/catalogue.js` | a 400, whatever the browser did |

Only the last one is a guard; the other three exist so nobody learns about the
rule *after* the payment window has opened. **The minimum is counted across the
whole order, not per flavour** — six of one pack is a box, and so is one of
each plus a spare. Packs inside a combo do not count towards it: a combo is its
own product at its own price, and letting one prop up a short box would be a
different offer than the one on the page.

`npm run check:prices` fails if the four minimums stop agreeing, or if the ₹90
quoted in the page copy stops matching `BOX_RATE_PAISE`. A page quoting five
while the server wants eight is a refusal after the customer has tried to pay,
which is the one failure worth spending a check on.

## Delivery

**Free from ₹450 of goods, ₹100 below it.** `FREE_DELIVERY_FROM_PAISE` and
`DELIVERY_PAISE` in `api/_lib/catalogue.js`, and `deliveryFor()` is the only
thing that decides it.

**Three numbers are set to meet, and changing one alone breaks the offer:**

    BOX_MIN_PACKS (5) × BOX_RATE_PAISE (9000) = 45000 = FREE_DELIVERY_FROM_PAISE

The smallest box a customer can build lands *exactly* on free delivery. That is
why the comparison is `>=` and not `>` — at `>` the minimum box would miss by a
rupee and the whole arrangement would read as a trick. The Poora Family Pack is
priced at the same ₹450, so the made-up box and the build-it-yourself box cost
the same. **Move any one of those three and re-check the other two.**

**The threshold is measured on goods, never on the total.** Adding the delivery
charge to the number that decides whether there is a delivery charge is how a
₹399 order quietly becomes free.

In practice only the two duos ever pay it — five packs come to ₹450 and the
Family Pack is ₹450, so every box and the largest combo clear the threshold on
their own. `npm run check:prices` checks both numbers against every place the
page quotes them, because a delivery charge that appears for the first time at
the payment window is the moment a customer decides you are not to be trusted.

`priceOrder` returns `{ items, subtotal_paise, delivery_paise, total_paise }`
and `create-order` sends all three to the page, so the customer is shown the
figures the charge was actually built from rather than a recomputation that
might disagree. The Razorpay order carries a `charges` note saying the same
thing, so the dashboard explains itself.

### Why the delivery charge lives in `notes`

The `preorders` table has no column for it and **it is not getting one.** An
insert that names a column the table does not have is refused in full, address
and all — that is how a paid order was lost once already, and a migration is
not something to make a live checkout depend on again.

So `total_paise` is **what was charged**, goods plus delivery, which makes it
comparable with `paid_paise` (Razorpay's own figure) and with the dashboard. A
mismatch between those two now means something is wrong rather than meaning
nothing. The breakdown goes in `notes`, written **before** the customer's own
note because that field is capped at 500 characters and a customer who fills it
would otherwise push the delivery line off the end. Their instructions are on
the Razorpay order too, so putting them second loses nothing.

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

**Add to cart** on the combo cards, and **Add box to cart** in the box builder,
fill a cart held in the browser's `localStorage`, so it survives moving between
pages. `cart.js` keeps an `ORDERABLE` list of what can be bought and filters the
stored cart against it on every read, so a cart saved before the line-up changed
corrects itself on the next page view instead of carrying a line the checkout
would drop without explanation. A cart holding fewer than six loose packs still
renders — the drawer says how many are missing and gives you a dead button
rather than a link to a checkout that would turn you away.
`npm run check:prices` fails if that list and the checkout picker stop matching. The header shows
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

The add-to-cart buttons are links to `/preorder?product=…`, so they still do
something sensible with JavaScript off; the cart script intercepts the click
when it is on. The box builder cannot work that way — a running total needs
script — so it carries a `<noscript>` pointing at the checkout, whose picker
builds the same box. The single packs' cards and buy boxes link to
`/#build-a-box`.

**The PIN code box only accepts digits**, six of them — anything else is stripped as it is typed, including out of a paste, and the caret is put back where it was rather than jumping to the end. Submitting still checks the whole thing (`[1-9]` then five digits: an Indian PIN never starts with a zero), and `docs/supabase-setup.sql` now carries the same rule as a database constraint, because the form is not the guard — anyone can post to that table with the public key. If your table already exists, the bottom of that file has the one `alter table` to add it.

**We deliver in Bengaluru and nowhere else**, so the checkout enforces it
rather than only saying it. The city and state are not questions any more —
they are shown as "Bengaluru, Karnataka" and submitted from hidden inputs, so
the order row keeps its shape — and the PIN code is the serviceability check:
`560xxx` passes, everything else is refused with a reason before any money
moves. Someone in Delhi finds out on the form, not after paying.

The rule is written in three places on purpose. `assets/js/preorder.js` is the
convenience, `pincode()` in `api/_lib/http.js` covers the dormant API path, and
the `check (pincode ~ '^560[0-9]{3}$')` constraint in `docs/supabase-setup.sql`
is the one that actually holds — the browser writes that row itself, so the
table is the only guard it cannot talk past. **Widen all three together**, and
run the `alter table` at the bottom of that file on an existing table.

The state dropdown and the ~150-city `CITY_STATE` autofill map that used to
fill it in are gone, along with the 36-item `STATES` list. They existed to make
a nationwide address easy to type; with one city there is nothing to choose.
Both are in git history if a second city arrives.

**Customers can reach a human.** The phone number and email are in the footer
of all eight pages, and the FAQ answer about cancelling points at both. That
was an open gap for a long time — a shop taking money with no way to contact it
is not a shop.

Storing orders needs the Supabase table in place; until then `/preorder`
says so rather than taking an order it cannot keep.
**[docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md) has the steps.**

## Payments

**The pre-order is paid.** Razorpay Standard Checkout takes the money at
checkout; there is no path through the form that places an order without one.

The flow, and why it is in that order:

1. The browser posts **slugs and quantities only** to `POST /api/create-order`.
2. That handler prices the basket from `api/_lib/catalogue.js` — never from the
   request — and opens a Razorpay order for the amount it computed. It returns
   the order id and `RAZORPAY_KEY_ID`, so no key is written into a static file.
3. `assets/js/payment.js` loads Razorpay's `checkout.js` **on demand** and opens
   the modal. A customer who never reaches step three never downloads it, and a
   third-party script that fails cannot take the form down with it.
4. On success the modal hands back three ids, which go to
   `POST /api/verify-payment`. That does two checks: the HMAC-SHA256 signature
   over `order_id|payment_id` under the key secret, and then a read of the order
   back from Razorpay to confirm it is actually `paid`. The signature says the
   ids are genuine; only the second check says the money arrived.
5. **Only then** is the order row written, carrying the payment ids and the
   amount Razorpay reported. A dismissed modal or a declined card leaves nothing
   behind to reconcile.

### If Supabase refuses the row

**The delivery address is written into the Razorpay order's notes**, by
`/api/create-order`, before the payment window even opens. That is not
bookkeeping — it is the whole recovery plan.

The order row is written by the browser, to Supabase, *after* the payment
succeeds. If that write fails the money is already taken. It has happened: the
checkout sent `razorpay_order_id`, `razorpay_payment_id` and `paid_paise` to a
table where the migration had not been run, Postgres refused the whole insert
over the unknown columns, and a real customer's address went with it. Razorpay
had their name, email and phone from the modal's prefill, and nothing else.

Two things stop that now. The address is on the payment, so the Razorpay
dashboard alone is enough to pack and deliver an order. And the Supabase write
retries without the three optional columns when it is refused for a column the
table does not have — a paid order with no `paid_paise` is a nuisance, a paid
order with no address is a phone call to a stranger. The payment id is folded
into `notes` on that retry so the row can still be reconciled.

**Neither is a reason to skip the migration.** Run
`docs/migrate-add-payments.sql` — the whole file, as is, in Supabase's SQL
editor — then `npm run check:supabase` to confirm.

It is a separate file from `supabase-setup.sql` because that one only creates a
table that does not exist yet; `create table if not exists` is a no-op against
a live table and changes nothing about it. The migration also adds the PIN rule
**NOT VALID**, because a table holding orders from when the site shipped
India-wide will fail a plain CHECK against its own history.

### Where the money is true

Orders are written to Supabase **by the browser**, with the public anon key, and
the insert policy allows any row. So the `status: 'paid'` on a row is a claim,
not proof. It is not a way to get free snacks — nothing ships without a matching
payment in the Razorpay dashboard — but it does mean **Razorpay is the record of
the money and this table is a convenience copy.** Reconcile on
`razorpay_payment_id` before shipping.

Closing that properly means the server writing the row: a `SUPABASE_SERVICE_ROLE_KEY`
on the Vercel project, the insert moved into `/api/verify-payment`, and the
public insert policy dropped. `docs/supabase-setup.sql` says the same at the
bottom. That key is a password and must never go in `assets/` or in git.

### Configuration

Both values go in `.env` locally **and** in the Vercel project's environment
variables. `.env.example` is the template.

| Variable | Where it may appear |
|---|---|
| `RAZORPAY_KEY_ID` | Server and browser. Publishable, but still served from `/api/create-order` so switching test keys for live ones is an environment change, not a redeploy. |
| `RAZORPAY_KEY_SECRET` | **Server only.** Signs verification. Never in `assets/`, never in git. |

`.env` is gitignored. **This repository is public**, so a commit of the secret
is a live compromise, not a tidy-up job — rotate it in the Razorpay dashboard
rather than just deleting the file.

With the variables unset every checkout returns `503 NO_RAZORPAY` and the form
says "Payments are not switched on yet". That is deliberate — no order is placed
that nobody paid for — but it is the single most likely thing to be wrong after
a deploy, because **Vercel does not apply an environment variable change to a
deployment that already exists.** Setting the variables is only half of it; the
project has to be redeployed afterwards.

To check without attempting a payment:

```bash
curl https://proteinpoora.shop/api/payment-status
# {"configured":true,"mode":"test","hints":[]}

curl 'https://proteinpoora.shop/api/payment-status?check=1'
# ...,"credentials":"accepted"     the pair works; checkout will work
# ...,"credentials":"rejected"     Razorpay refuses them; `detail` says why
# ...,"credentials":"unreachable"  the network, not the keys
```

**`configured` means one thing only: both variables are present and non-empty.**
It says nothing about whether they are the right ones — a live shop can sit on
`configured: true` and reject every payment because the secret was pasted with
a quote around it. `?check=1` is the one that answers that: it makes one cheap
authenticated call to Razorpay, creates nothing, and caches for 60 seconds.

`hints` catches the paste accidents before you have to ask Razorpay at all —
stray whitespace, wrapping quotes, a newline in the middle, a key id that does
not start with `rzp_test_` or `rzp_live_`. It never echoes a key back.

`configured: false` on a deployed site means one of four things, in the order
they are usually the cause: the project was not redeployed after the variables
were added; the variables were added to Production only while you are looking
at a Preview deployment; a name is misspelt (it is `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET`, exactly); or a value was pasted with a stray space or
quote. The endpoint returns those two booleans and nothing else — no key, no
prefix of a secret.

If that endpoint 404s instead of answering, the functions themselves are not
deployed, which is a different problem: check that `api/` is in the deploy and
that the project's build settings were not changed.

### Prices are written down three times

`api/_lib/catalogue.js` (what the server charges), the `#catalogue` JSON in
`preorder/index.html` (what the picker shows), and `data-price-paise` on each
card in `index.html`. There is no build step to generate one from the others,
and the server cannot price an order from a file the customer can edit. What is
not acceptable is the three drifting apart, so **`npm run check:prices` fails if
they disagree** — run it after any price change. It also checks the `ORDERABLE`
list in `assets/js/cart.js` against the picker, since a cart that drops a combo
on read is a combo nobody can buy.

### Testing

```bash
npm run dev                  # reads .env, mounts /api/*
npm run check:prices
npm run test:payments        # 12 checks, no Razorpay account needed
```

`scripts/test-payments.sh` covers everything that runs before Razorpay is
called: basket validation, and the missing-field and signature checks. It does
**not** prove the key pair works or that a real payment verifies — that needs a
live call. For that, open `/preorder`, fill the form, pay with Razorpay's test
card `4111 1111 1111 1111`, any future expiry, any CVV, and any OTP, then check
the payment in the Razorpay dashboard and the row in Supabase.

Taking money elsewhere on the site is still a job for the Shopify store.

## Fonts

The Devanagari font file is subset to the wordmark glyphs (पूरा) only, to keep it at 2 KB. If Hindi text is added anywhere else, replace `assets/fonts/baloo-2-devanagari-wordmark.woff2` with the full Devanagari subset from Google Fonts and keep the `@font-face` block in `fonts.css` as is.
