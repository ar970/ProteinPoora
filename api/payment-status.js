'use strict';

/**
 * Is checkout configured, and does it actually work?
 *
 *   GET /api/payment-status
 *   → { configured, mode, hints }
 *
 *   GET /api/payment-status?check=1      also asks Razorpay
 *   → { configured, mode, credentials: 'accepted' | 'rejected' | 'unreachable',
 *       detail, hints }
 *
 * "Payments are not switched on yet" is the right thing to tell a customer and
 * useless to whoever has to fix it: it cannot say whether a key is missing, a
 * name is misspelt, or the variables were set but the project was never
 * redeployed. This answers that without a test payment and without a card.
 *
 * `configured` deliberately means one thing only: both variables are present
 * and non-empty. It says nothing about whether the pair is valid, which is why
 * ?check=1 exists — a live shop can sit on configured:true and still reject
 * every payment because the secret was pasted with a quote around it.
 *
 * Nothing here returns a key, a length, or a prefix of a secret. `detail` is
 * Razorpay's own error text ("Authentication failed"), not ours. Whether a shop
 * takes payments is not a secret; its credentials are, and none of them are
 * reachable from here.
 */

const { send, guard } = require('./_lib/http.js');

/**
 * The live check costs an upstream call, and this endpoint is public, so the
 * answer is held briefly. Serverless instances are short-lived and this is
 * per-instance — it is a courtesy to Razorpay's rate limits, not a guarantee.
 */
const TTL_MS = 60 * 1000;
let cached = null;

/** Characters that are almost always a paste accident rather than a key. */
function looksMangled(raw) {
  const notes = [];
  if (raw !== raw.trim()) notes.push('has leading or trailing whitespace');
  if (/^["'].*["']$/.test(raw.trim())) notes.push('is wrapped in quotes');
  if (/\s/.test(raw.trim())) notes.push('contains a space or newline');
  return notes;
}

async function askRazorpay() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.result;

  let result;
  try {
    const { razorpay } = require('./_lib/razorpay.js');
    // Cheapest authenticated call there is: one order, which we ignore. It
    // proves the key pair, and creates nothing.
    await razorpay().orders.all({ count: 1 });
    result = { credentials: 'accepted', detail: null };
  } catch (err) {
    const description = (err && err.error && err.error.description) || '';
    const status = err && typeof err.statusCode === 'number' ? err.statusCode : 0;
    if (description) {
      result = {
        credentials: 'rejected',
        detail: `Razorpay answered ${status}: ${description}`
      };
    } else {
      result = {
        credentials: 'unreachable',
        detail: 'api.razorpay.com did not answer. This is the network, not the keys.'
      };
    }
  }

  cached = { at: Date.now(), result };
  return result;
}

module.exports = async function handler(req, res) {
  if (guard(req, res, ['GET'])) return;

  const rawId = process.env.RAZORPAY_KEY_ID || '';
  const rawSecret = process.env.RAZORPAY_KEY_SECRET || '';
  const keyId = rawId.trim();
  const keySecret = rawSecret.trim();
  const configured = Boolean(keyId && keySecret);

  const hints = [];
  for (const [name, raw] of [['RAZORPAY_KEY_ID', rawId], ['RAZORPAY_KEY_SECRET', rawSecret]]) {
    for (const note of looksMangled(raw)) hints.push(`${name} ${note}`);
  }
  if (keyId && !/^rzp_(test|live)_/.test(keyId)) {
    hints.push('RAZORPAY_KEY_ID does not start with rzp_test_ or rzp_live_');
  }

  const body = {
    configured,
    mode: configured ? (/^rzp_live_/.test(keyId) ? 'live' : 'test') : null,
    hints
  };

  const wantsCheck = /(^|&)check=1(&|$)/.test(String(req.url || '').split('?')[1] || '');
  if (wantsCheck && configured) {
    Object.assign(body, await askRazorpay());
  }

  return send(res, 200, body);
};
