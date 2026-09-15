'use strict';

/**
 * Razorpay credentials and client, read from the environment and nowhere else.
 *
 * RAZORPAY_KEY_ID is publishable — the browser needs it to open the checkout
 * modal — but it is still served from here rather than written into a static
 * file, so switching between test and live keys is an environment change and
 * not a redeploy of the front end.
 *
 * RAZORPAY_KEY_SECRET signs payment verification. It is read in this process
 * and never returned by any handler. Nothing in `assets/` may import it, and
 * the repository is public, so it lives only in `.env` locally and in the
 * Vercel project's environment variables in production.
 */

const Razorpay = require('razorpay');

function credentials() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) {
    throw Object.assign(
      new Error('Payments are not configured yet.'),
      { statusCode: 503, code: 'NO_RAZORPAY' }
    );
  }
  return { keyId, keySecret };
}

let client = null;

function razorpay() {
  if (client) return client;
  const { keyId, keySecret } = credentials();
  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

/**
 * Razorpay's SDK rejects with a plain object — `{ statusCode, error }`, not an
 * Error — so this turns one into something `onError` can render without
 * leaking our key or their internals.
 *
 * The status alone is not enough to say what went wrong. Razorpay answers a
 * bad key with 401 *and* a JSON body describing it; a proxy, firewall or
 * captive network that refuses the connection answers 403 with no body at all.
 * Both used to be reported here as "check your keys", which is the worst
 * possible advice when the keys are fine and the network is not — so the two
 * are told apart by whether a description came back.
 */
function asApiError(err) {
  const upstream = err && typeof err.statusCode === 'number' ? err.statusCode : 0;
  const description = (err && err.error && err.error.description) || '';

  if (!description) {
    console.error(
      '[razorpay] no response body with status', upstream || '(none)',
      '— api.razorpay.com was not reached. Check egress/proxy/firewall, not the keys.'
    );
    return Object.assign(new Error('We could not reach our payment provider. Please try again in a moment.'), {
      statusCode: 502,
      code: 'RAZORPAY_UNREACHABLE'
    });
  }

  // A described 401/403 is Razorpay refusing our credentials. That is our
  // fault, not the customer's, so it must not come back as a 4xx that tells
  // them to go and fix their own details.
  if (upstream === 401 || upstream === 403) {
    console.error('[razorpay] credentials rejected — check RAZORPAY_KEY_ID/SECRET:', description);
    return Object.assign(new Error('Payments are misconfigured at our end.'), {
      statusCode: 500,
      code: 'RAZORPAY_AUTH'
    });
  }

  console.error('[razorpay]', upstream || '(no status)', description);
  return Object.assign(new Error('We could not start that payment. Please try again.'), {
    statusCode: 502,
    code: 'RAZORPAY_UPSTREAM'
  });
}

module.exports = { credentials, razorpay, asApiError };
