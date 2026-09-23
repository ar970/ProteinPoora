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

/**
 * There are two ways to buy, and they price differently.
 *
 *   A combo   a product with its own slug and its own fixed price.
 *   A box     five or more loose packs, any mix, at a flat rate each.
 *
 * A loose pack is never sold on its own. Below five it is not a cheaper snack,
 * it is not a snack at all: the order is refused. That rule lives here because
 * here is the only place that decides money.
 */

/** slug → price in paise. Paise, not rupees: integers, so no float rounding. */
const PRICES = Object.freeze({
  'combo-bhujia-duo': 17000,
  'combo-chakli-duo': 15000,
  'combo-all-five': 45000
});

/**
 * What one loose pack costs inside a box, whichever pack it is. Flat, so the
 * page can say "₹90 each" and mean it — a customer should not have to add up
 * five different numbers to know what their box comes to.
 */
const BOX_RATE_PAISE = 9000;

/** Fewer than this many loose packs is not a box. */
const BOX_MIN_PACKS = 5;

/** The packs a box can be built from. Same slugs as their product pages. */
const BOX_PACKS = Object.freeze({
  'masala-bhujia': 'Masala Bhujia',
  'pudina-bhujia': 'Pudina Bhujia',
  'sweet-chilli-chakli': 'Sweet Chilli Chakli',
  'cheddar-cheese-chakli': 'Cheddar Cheese Chakli',
  'korean-bbq-peanuts': 'Korean BBQ Peanuts'
});

const NAMES = Object.freeze(Object.assign({
  'combo-bhujia-duo': 'Bhujia Duo',
  'combo-chakli-duo': 'Chakli Duo',
  'combo-all-five': 'Poora Family Pack'
}, BOX_PACKS));

/** What a slug costs, or undefined if it is not sold at all. */
function rateFor(slug) {
  if (Object.prototype.hasOwnProperty.call(PRICES, slug)) return PRICES[slug];
  if (Object.prototype.hasOwnProperty.call(BOX_PACKS, slug)) return BOX_RATE_PAISE;
  return undefined;
}

/**
 * Delivery. Free from this much of goods, a flat charge below it.
 *
 * The threshold is read against the goods subtotal, never the total — adding
 * the delivery charge to the figure that decides whether there is a delivery
 * charge is how a ₹399 order becomes free.
 */
const FREE_DELIVERY_FROM_PAISE = 45000;
const DELIVERY_PAISE = 10000;

/*
 * These three are set to meet, and changing one alone breaks the offer:
 *
 *   BOX_MIN_PACKS (5) × BOX_RATE_PAISE (9000) = 45000 = FREE_DELIVERY_FROM_PAISE
 *
 * so the smallest possible box lands exactly on free delivery, and every box
 * above it is free too. The comparison below is `>=` for that reason — at `>`
 * the minimum box would miss by a rupee and the whole arrangement would read
 * as a trick. The Poora Family Pack is priced at the same 45000 so the made-up
 * box and the build-it-yourself box cost the same.
 */

/**
 * What delivery costs on a given subtotal, in paise.
 *
 * Nothing ordered means nothing to deliver. priceOrder never reaches here with
 * an empty order, but the checkout calls the same rule to draw its summary,
 * and an empty basket quoting a ₹100 delivery charge is a bad first thing to
 * see.
 */
function deliveryFor(subtotalPaise) {
  if (!subtotalPaise) return 0;
  return subtotalPaise >= FREE_DELIVERY_FROM_PAISE ? 0 : DELIVERY_PAISE;
}

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
    if (rateFor(slug) === undefined) {
      throw badRequest('One of those snacks is no longer listed.');
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QTY}.`);
    }
    wanted.set(slug, (wanted.get(slug) || 0) + qty);
  }

  // A box is counted across the whole order, not per flavour: five of one pack
  // is a box, and so is one of each flavour. Packs inside a combo do not
  // count towards it — a combo is its own product at its own price, and
  // letting it prop up a short box would be a different offer than the one on
  // the page.
  let loose = 0;
  for (const [slug, qty] of wanted) {
    if (Object.prototype.hasOwnProperty.call(BOX_PACKS, slug)) loose += qty;
  }
  if (loose > 0 && loose < BOX_MIN_PACKS) {
    const short = BOX_MIN_PACKS - loose;
    throw badRequest(
      `A box needs at least ${BOX_MIN_PACKS} packs and you have ${loose}. ` +
      `Add ${short} more ${short === 1 ? 'pack' : 'packs'}, or pick a combo instead.`
    );
  }

  const items = [];
  let subtotal = 0;
  for (const [slug, qty] of wanted) {
    if (qty > MAX_QTY) {
      throw badRequest(`Quantity must be a whole number between 1 and ${MAX_QTY}.`);
    }
    const rate = rateFor(slug);
    subtotal += rate * qty;
    items.push({ slug, name: NAMES[slug], qty, price_paise: rate });
  }

  const delivery = deliveryFor(subtotal);
  const total = subtotal + delivery;

  if (total < MIN_PAISE) throw badRequest('That order is below the minimum we can charge.');
  if (total > MAX_PAISE) throw badRequest('That order is larger than we can take online.');

  return {
    items,
    subtotal_paise: subtotal,
    delivery_paise: delivery,
    total_paise: total
  };
}

module.exports = {
  PRICES, NAMES, BOX_PACKS, BOX_RATE_PAISE, BOX_MIN_PACKS,
  FREE_DELIVERY_FROM_PAISE, DELIVERY_PAISE, deliveryFor,
  MIN_PAISE, MAX_PAISE, rateFor, priceOrder
};
