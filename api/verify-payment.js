'use strict';

/**
 * Check that a payment really happened, and for the right amount.
 *
 *   POST /api/verify-payment
 *     { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *   → 200 { verified: true, order_id, payment_id, amount_paise, currency }
 *   → 400 { error } for a missing field or a signature that does not match
 *
 * Two checks, not one.
 *
 * The signature proves the three ids came from Razorpay and were not assembled
 * by whoever is driving the browser: it is HMAC-SHA256 of
 * `order_id|payment_id` under our key secret, which only this process holds.
 *
 * Then the order is read back from Razorpay. The signature says the ids are
 * genuine; it does not say the money arrived, so a caller replaying an older
 * genuine pair, or calling straight here after dismissing the modal, still
 * fails. `amount_paid` from Razorpay is the figure returned to the caller —
 * never one the browser sent.
 */

const crypto = require('crypto');
const { readJson, send, guard, onError, badRequest } = require('./_lib/http.js');
const { credentials, razorpay, asApiError } = require('./_lib/razorpay.js');

function required(value, field) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw badRequest(`${field} is missing.`);
  if (v.length > 200) throw badRequest(`${field} is not valid.`);
  return v;
}

/** Constant-time compare, so a mismatch does not leak where it diverged. */
function sameSignature(expected, given) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (guard(req, res, ['POST'])) return;

  try {
    const body = await readJson(req);
    const orderId = required(body.razorpay_order_id, 'Order id');
    const paymentId = required(body.razorpay_payment_id, 'Payment id');
    const signature = required(body.razorpay_signature, 'Signature');

    const { keySecret } = credentials();
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (!sameSignature(expected, signature)) {
      // Loud in the log, vague to the caller: a probe should not be told
      // which half of the pair it got wrong.
      console.error('[verify-payment] signature mismatch for order', orderId);
      throw badRequest('That payment could not be verified.');
    }

    let order;
    try {
      order = await razorpay().orders.fetch(orderId);
    } catch (err) {
      throw asApiError(err);
    }

    if (!order || order.status !== 'paid') {
      console.error('[verify-payment] order', orderId, 'is', order && order.status);
      throw badRequest('That payment has not completed.');
    }

    return send(res, 200, {
      verified: true,
      order_id: order.id,
      payment_id: paymentId,
      amount_paise: order.amount_paid,
      currency: order.currency
    });
  } catch (err) {
    return onError(res, err);
  }
};
