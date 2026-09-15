'use strict';

/**
 * What a thing costs, according to the server.
 *
 * The browser sends slugs and quantities only. It never sends an amount, and
 * nothing here trusts one if it does: a checkout that lets the client name its
 * own price is a checkout that charges ₹1 for the family pack.
 *
 * This is the third place prices are written down — the cards in `index.html`
 * carry `data-price-paise`, and the `#catalogue` JSON in `preorder/index.html`
 * feeds the picker. That is one place too many, but there is no build step to
 * generate one from another, and money cannot be priced from a file the
 * customer can edit. `npm run check:prices` fails if the three ever disagree,
 * so the duplication cannot drift quietly.
 *
 * In a Liquid theme this whole module goes away: Shopify prices the cart.
 */

/** slug → price in paise. Paise, not rupees: integers, so no float rounding. */
const PRICES = Object.freeze({
  'masala-bhujia': 9900,
  'pudina-bhujia': 9900,
  'sweet-chilli-chakli': 8900,
  'cheddar-cheese-chakli': 8900,
  'korean-bbq-peanuts': 9900,

  'combo-bhujia-duo': 17000,
  'combo-chakli-duo': 15000,
  'combo-all-five': 42900
});

const NAMES = Object.freeze({
  'masala-bhujia': 'Masala Bhujia',
  'pudina-bhujia': 'Pudina Bhujia',
  'sweet-chilli-chakli': 'Sweet Chilli Chakli',
  'cheddar-cheese-chakli': 'Cheddar Cheese Chakli',
  'korean-bbq-peanuts': 'Korean BBQ Peanuts',

  'combo-bhujia-duo': 'Bhujia Duo',
  'combo-chakli-duo': 'Chakli Duo',
  'combo-all-five': 'Poora Family Pack'
});

const MAX_LINES = 10;
const MAX_QTY = 20;

/** Razorpay rejects anything under a rupee, and so should we. */
const MIN_PAISE = 100;

/** An order this large is a mistake or a test, not a snack order. */
const MAX_PAISE = 50000000;

/**
 * Prices [{slug, qty}] against the list above.
 * Throws a 400-shaped error for anything it will not price.
 */
function priceOrder(input, badRequest) {
  if (!Array.isArray(input) || !input.length) {
    throw badRequest('Choose at least one snack.');
  }
  if (input.length > MAX_LINES) {
    throw badRequest('That is more different snacks than we can take in one pre-order.');
  }

  // Fold duplicate lines together first, so ten lines of one slug cannot slip
  // past the per-line quantity cap.
  const wanted = new Map();
  for (const line of input) {
    const slug = String((line && line.slug) || '').trim().toLowerCase();
    if (!slug) throw badRequest('A snack was missing from the order.');
    if (!Object.prototype.hasOwnProperty.call(PRICES, slug)) {
      throw badRequest('One of those snacks is no longer listed.');
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QTY}.`);
    }
    wanted.set(slug, (wanted.get(slug) || 0) + qty);
  }

  const items = [];
  let total = 0;
  for (const [slug, qty] of wanted) {
    if (qty > MAX_QTY) {
      throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QTY}.`);
    }
    total += PRICES[slug] * qty;
    items.push({ slug, name: NAMES[slug], qty, price_paise: PRICES[slug] });
  }

  if (total < MIN_PAISE) throw badRequest('That order is below the minimum we can charge.');
  if (total > MAX_PAISE) throw badRequest('That order is larger than we can take online.');

  return { items, total_paise: total };
}

module.exports = { PRICES, NAMES, MIN_PAISE, MAX_PAISE, priceOrder };
