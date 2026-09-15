'use strict';

/**
 * Open a Razorpay order.
 *
 *   POST /api/create-order   { items: [{ slug, qty }] }
 *   → 200 { order_id, amount, currency, key_id, items, total_paise }
 *
 * The amount is computed here from `_lib/catalogue.js`. The request body
 * carries slugs and quantities and nothing else — an `amount` in the body is
 * ignored, because the browser is the one party to this transaction that a
 * customer can edit.
 *
 * The response includes `key_id` so the checkout modal has it without a second
 * request and without it being baked into a static file.
 */

const crypto = require('crypto');
const { readJson, send, guard, onError, badRequest } = require('./_lib/http.js');
const { priceOrder } = require('./_lib/catalogue.js');
const { credentials, razorpay, asApiError } = require('./_lib/razorpay.js');

/** Razorpay caps `receipt` at 40 characters. */
function receipt() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRTUVWXY';
  let out = '';
  for (const byte of crypto.randomBytes(8)) out += alphabet[byte % alphabet.length];
  return `pp_${Date.now().toString(36)}_${out}`.slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (guard(req, res, ['POST'])) return;

  try {
    const body = await readJson(req);
    const { items, total_paise: amount } = priceOrder(body.items, badRequest);

    const { keyId } = credentials();

    let order;
    try {
      order = await razorpay().orders.create({
        amount,                       // paise, integer, server-computed
        currency: 'INR',
        receipt: receipt(),
        // Handy when reconciling a payment in the dashboard against an order.
        notes: {
          items: items.map((i) => `${i.slug}x${i.qty}`).join(',').slice(0, 512)
        }
      });
    } catch (err) {
      throw asApiError(err);
    }

    return send(res, 200, {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      items,
      total_paise: amount
    });
  } catch (err) {
    return onError(res, err);
  }
};
