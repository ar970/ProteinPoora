'use strict';

/**
 * Is checkout configured?
 *
 *   GET /api/payment-status
 *   → { configured: true,  mode: 'test' | 'live' }
 *   → { configured: false, mode: null }
 *
 * "Payments are not switched on yet" is the right thing to tell a customer and
 * useless to whoever has to fix it: it cannot say whether a key is missing, a
 * name is misspelt, or the variables were set but the project was never
 * redeployed. This answers that without a test payment and without a card.
 *
 * It returns two booleans and nothing else — no key, no length, no prefix of a
 * secret. Whether a shop takes payments is not a secret; its credentials are,
 * and none of them are reachable from here.
 */

const { send, guard } = require('./_lib/http.js');

module.exports = async function handler(req, res) {
  if (guard(req, res, ['GET'])) return;

  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const configured = Boolean(keyId && keySecret);

  return send(res, 200, {
    configured,
    mode: configured ? (/^rzp_live_/.test(keyId) ? 'live' : 'test') : null
  });
};
