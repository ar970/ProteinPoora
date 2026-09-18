'use strict';

/**
 * Open a Razorpay order.
 *
 *   POST /api/create-order   { items: [{ slug, qty }], delivery: {…} }
 *   → 200 { order_id, amount, currency, key_id, items, total_paise }
 *
 * The amount is computed here from `_lib/catalogue.js`. The request body's
 * slugs and quantities are the only thing it is trusted for — an `amount` in
 * the body is ignored, because the browser is the one party to this
 * transaction that a customer can edit.
 *
 * **The delivery address is written into the Razorpay order's notes.** That is
 * not decoration. The order row is written by the browser, to Supabase, after
 * the payment succeeds; if that write fails for any reason — a column that was
 * never migrated, an expired token, a closed laptop — the money is taken and
 * the address is gone. It has happened. Attaching the address to the payment
 * means the one record that certainly exists, because Razorpay made it, is
 * enough to fulfil the order on its own.
 *
 * The response includes `key_id` so the checkout modal has it without a second
 * request and without it being baked into a static file.
 */

const crypto = require('crypto');
const { readJson, send, guard, onError, badRequest, pincode } = require('./_lib/http.js');
const { priceOrder } = require('./_lib/catalogue.js');
const { credentials, razorpay, asApiError } = require('./_lib/razorpay.js');

/** Razorpay allows 15 notes, each value a string of at most 256 characters. */
const NOTE_MAX = 256;
const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);

/**
 * The address, folded into notes.
 *
 * Deliberately forgiving about everything except the PIN code: this is a
 * backstop, and a half-filled address on the payment beats no address at all.
 * The PIN is the exception because it decides whether we can deliver, and
 * refusing here means the customer never reaches the payment window rather
 * than paying for a delivery we cannot make.
 */
function deliveryNotes(delivery) {
  const d = delivery && typeof delivery === 'object' ? delivery : {};
  const pin = pincode(d.pincode);            // throws a 400 for anything but 560xxx
  const street = [clean(d.address1), clean(d.address2)].filter(Boolean).join(', ');
  return {
    customer: clean(d.customer_name),
    phone: clean(d.phone),
    email: clean(d.email),
    address: clean(street),
    city: clean(d.city) || 'Bengaluru',
    pincode: pin,
    instructions: clean(d.notes)
  };
}

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
        // Everything needed to pack and deliver this order, on the payment
        // itself, so the dashboard is a sufficient record on its own.
        notes: Object.assign({
          items: items.map((i) => `${i.slug}x${i.qty}`).join(',').slice(0, NOTE_MAX)
        }, deliveryNotes(body.delivery))
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
