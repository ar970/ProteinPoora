# Pre-orders — setup

There are two ways to store pre-orders. **Pick one.**

| | What you do | Where you read orders |
| --- | --- | --- |
| **A. Straight to Supabase** *(no Vercel settings)* | Run one SQL file, send two public values | Supabase → Table Editor |
| **B. Through this site's own API** | Attach a database to the Vercel project | `/admin` on your own site |

**A is the shorter road** and touches nothing in Vercel. B gives you the
built-in `/admin` panel with status changes and CSV export.

Either way the storefront, the cart and the pre-order form work already: the
line-up is rendered from the page itself, so it is never blank and never waits
on a server.

---

## A. Straight to Supabase

Orders go from the customer's browser into your Supabase table. No serverless
function, no environment variables, no redeploys to remember.

**1. Create the table.** Supabase → **SQL Editor** → **New query** → paste
[`docs/supabase-setup.sql`](supabase-setup.sql) → **Run**. It creates the
table and locks it so the public can *add* an order and nothing else — no
reading, editing or deleting.

**2. Fill in two values.** Supabase → **Settings** → **API**, copy:

- **Project URL** — `https://<something>.supabase.co`
- **anon** / **publishable** key — a long string starting `eyJ` or `sb_`

Put them in [`assets/js/store-config.js`](../assets/js/store-config.js).

Both are public by design: the anon key is *made* to sit in browser code, and
committing it is normal. What protects your orders is the policy from step 1.
**Never** put the `service_role` / `secret` key there — that one is a real
password and would hand anyone the whole database.

**3. Read your orders** in Supabase → **Table Editor** → `preorders`. Sort by
`created_at`, export CSV from the same screen.

That is the whole of it. Nothing needs redeploying by hand — pushing the config
change deploys itself.

---

## B. Through this site's own API

### Attach a database to Vercel

Vercel does not store data by itself — a serverless function forgets everything
between requests. Any Postgres works (Neon, Supabase, Railway); the quickest
route is Vercel's own marketplace:

1. Vercel dashboard → your project → **Storage** → **Create Database**
2. Choose **Neon** (Postgres). The free tier is far more than this needs.
3. Connect it to the project. Vercel injects `DATABASE_URL` automatically.

There is nothing to copy or paste: Vercel injects the connection details
itself, under whatever name the provider or your chosen prefix produces. The
name does not matter — the code takes the first variable whose *value* is a
`postgres://` URL, prefers a pooled host, and can assemble one from separate
host/user/password/database variables if a provider injects those instead.

**Connecting a database in the Supabase or Neon dashboard is not enough.** The
connection has to reach *this Vercel project*. Either connect it through
Vercel's Storage tab, or paste a connection string into **Settings →
Environment Variables** as `DATABASE_URL`.

### Supabase: it must be the pooler string

Supabase gives two connection strings and only one of them works here.

| | Host | Works on Vercel? |
| --- | --- | --- |
| Direct | `db.<ref>.supabase.co` | **No** |
| Transaction pooler | `aws-0-<region>.pooler.supabase.com`, port 6543 | Yes |

The direct host resolves over IPv6 only on projects created since early 2024,
and Vercel's functions have no IPv6 egress — so it fails with
`getaddrinfo ENOTFOUND` even though the string is perfectly correct. It is also
the wrong shape for serverless regardless: functions open and drop connections
constantly and would exhaust a direct connection limit.

In Supabase: **Connect → Connection pooling → Transaction pooler**, and copy
that URI. Note the username is `postgres.<project-ref>`, not `postgres`, and
you have to substitute your real password for `[YOUR-PASSWORD]`.

`/admin` recognises this specific failure and says so, rather than leaving you
to guess from a DNS error.

If it still says no database, `/admin` shows what the server can actually see:
the names of every database-related variable in the deployment, or the real
connection error if a string is present but does not work. That is usually
enough to tell "nothing attached" from "wrong password" from "not redeployed".

The tables are created on the first request, and the five current snacks are
inserted at their present prices. Nothing to run by hand.

## Admin sign-in (route B)

Sign-in works as soon as the site deploys, with:

| | |
| --- | --- |
| Username | `archit` |
| Password | `proteinpoora123` |

Those are in `api/_lib/auth.js`, which means they are in a **public**
repository — anyone who finds `/admin` can read them and look at your
customers' names, phone numbers and addresses. The panel says so on a banner
until you change it.

To change it, in Vercel: **Settings → Environment Variables**, add
`ADMIN_PASSWORD` (and `ADMIN_USERNAME` if you want a different name), then
**Deployments → Redeploy**. The environment always wins over the built-in
values, so nothing in the code needs editing and the banner disappears.
Changing the password also signs out anyone currently signed in, because the
session signing key is derived from it.

Optional: `ADMIN_SESSION_SECRET`, any long random string, signs sessions with a
key independent of the password. Without it one is derived, which works fine.

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

**The cart.** Adding a snack writes to `localStorage` in that browser — it is
never sent anywhere until the order is placed, and it is per-device, so nothing
carries between a customer's phone and laptop. Each line keeps the name and
price that were on screen when it was added, purely so the drawer can render
without waiting for the API.

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
