# Pre-orders and the admin panel — setup

The storefront is still static files. Three serverless functions sit alongside
them to take pre-orders and back the admin panel:

| Route | Who | What it does |
| --- | --- | --- |
| `/api/products` | public reads, admin writes | the price list |
| `/api/preorders` | public writes, admin reads | the order book |
| `/api/admin` | public | sign in, sign out, session check |

Customers pre-order at **`/preorder`**. You manage everything at **`/admin`**,
linked from the footer of every page.

**Two things must be set up in Vercel before either page works.** Until then
`/preorder` says the line-up is unavailable and `/admin` refuses every sign-in.

---

## 1. Add a database

Vercel does not store data by itself — a serverless function forgets everything
between requests. Any Postgres works (Neon, Supabase, Railway); the quickest
route is Vercel's own marketplace:

1. Vercel dashboard → your project → **Storage** → **Create Database**
2. Choose **Neon** (Postgres). The free tier is far more than this needs.
3. Connect it to the project. Vercel injects `DATABASE_URL` automatically.

If you set it up somewhere else, add `DATABASE_URL` by hand under
**Settings → Environment Variables**, and use the **pooled** connection string
— the one with `-pooler` in the host. Serverless functions open and drop
connections constantly and a direct string will run out of them.

The tables are created on the first request, and the five current snacks are
inserted at their present prices. Nothing to run by hand.

## 2. Add the admin credentials

**Settings → Environment Variables**, for Production, Preview and Development:

| Name | Value |
| --- | --- |
| `ADMIN_USERNAME` | `archit` |
| `ADMIN_PASSWORD` | the password you chose |

Then **redeploy** — environment variables are read at deploy time.

The password is deliberately not written down here. This file is in the public
repository too, so printing it would leak it just as surely as putting it in the
code.

### Why these are not in the code

`github.com/ar970/ProteinPoora` is a public repository. A password committed to
it is readable by anyone, permanently — rewriting the commit later does not
help, because it has already been cloned and indexed. The admin panel lists
customers' names, phone numbers and home addresses, so the password has to stay
out of the repo. That is the only reason this step exists.

A password built from the brand name is also the first thing anyone would try,
so prefer something long and unrelated to "protein" or "poora". Changing it
costs one edit in the Vercel dashboard and no code change: edit `ADMIN_PASSWORD`
and redeploy. Everyone currently signed in is signed out automatically, because
the session signing key is derived from the password.

Optional: set `ADMIN_SESSION_SECRET` to any long random string to sign sessions
with a key independent of the password. Without it one is derived, which works
fine.

---

## Running it locally

```bash
npm install

DATABASE_URL='postgres://…' \
ADMIN_USERNAME='archit' \
ADMIN_PASSWORD='choose-something' \
node scripts/dev-server.js
```

Then open <http://127.0.0.1:3000>. The dev server routes `/api/*` to the same
handler files Vercel runs and serves everything else as static files, so what
you see locally is what deploys.

---

## How it behaves

**Placing an order.** The browser sends slugs and quantities — never a price.
The server looks every price up in the database as it writes the order, so a
tampered request cannot set its own total. Amounts are stored as whole paise;
nothing is ever a floating-point rupee.

**Sold out.** A product set to `sold_out` still shows on the pre-order form,
greyed out and unorderable. `hidden` removes it from the form and from the
public product list entirely.

**Sessions.** Signing in sets one `HttpOnly`, `SameSite=Strict`, `Secure`
cookie holding a signed token. Nothing is stored server-side, the expiry is
inside the signature, and it lasts eight hours. Wrong passwords are throttled
per IP, eight tries per ten minutes.

**Orders are never rewritten.** Each one stores its own copy of the line items
and the prices they were placed at, so changing a price — or deleting a product
— leaves existing orders exactly as the customer placed them.

**CSV export.** *Download CSV* gives you every order with its full address, for
a courier or a spreadsheet. Cells starting with `=`, `+`, `-` or `@` are
prefixed with an apostrophe so a customer cannot smuggle a formula into a file
you open in Excel.

---

## What this is not

There is **no payment**. The form says "pay nothing now", and the flow is
built for taking a list of interested customers before the first batch is
ready. Taking money needs a payment gateway, which needs a registered business
entity and KYC — worth doing on Shopify rather than here.

Products carry only their commercial fields: name, slug, price, pack size,
protein and availability. Photography, ingredients and the nutrition tables
stay in the page markup, because that is where they have to live once these
pages become Liquid templates.

## When Shopify arrives

The split is deliberate and maps straight across:

- `products` rows → Shopify products. Price and availability come from Shopify;
  the theme keeps the story.
- `preorders` rows → draft orders, or a customer list to email. Export the CSV
  and import it.
- `/preorder` → the Shopify cart and checkout. The picker becomes
  `{% for product in collection.products %}`, and `assets/js/preorder.js` keeps
  only the quantity and summary behaviour.
- `/admin` and all three functions → delete them. Shopify's own admin replaces
  this entirely.
