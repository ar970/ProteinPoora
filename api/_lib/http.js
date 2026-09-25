'use strict';

/**
 * Small helpers shared by the three API handlers: JSON in, JSON out, and the
 * field validation for the pre-order form.
 *
 * Everything a customer types is validated here rather than only in the
 * browser. Client-side checks are a convenience for the person filling the
 * form in; they are not a control, because nothing stops a direct POST.
 */

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(req) {
  // Vercel's Node runtime parses application/json for us. A bare http server
  // (local tests) does not, so fall back to reading the stream.
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return req.body;
  }

  const raw = await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw Object.assign(new Error('Request body must be a JSON object.'), { statusCode: 400 });
  }
}

function send(res, status, payload, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // These endpoints return per-customer and admin-only data; a shared cache
  // holding either would be a leak.
  res.setHeader('Cache-Control', 'no-store');
  if (headers) {
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload));
}

function fail(res, status, message, extra) {
  send(res, status, Object.assign({ error: message }, extra || {}));
}

/** Answers OPTIONS and 405s anything not in `methods`. Returns true if handled. */
function guard(req, res, methods) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', methods.join(', '));
    res.end();
    return true;
  }
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    fail(res, 405, `${req.method} is not allowed here.`);
    return true;
  }
  return false;
}

/**
 * Server-side failures whose message is ours, written for a customer, and
 * safe to send. Everything else with a 5xx is flattened to one generic line,
 * because an unplanned 500 tends to carry a stack trace or a query in it.
 */
const SAFE_5XX = {
  NO_DATABASE: [503, 'The store database is not configured yet.'],
  NO_RAZORPAY: [503, 'Payments are not switched on yet. Please try again shortly.'],
  RAZORPAY_UNREACHABLE: [502, 'We could not reach our payment provider. Please try again in a moment.'],
  RAZORPAY_UPSTREAM: [502, 'We could not start that payment. Please try again.'],
  RAZORPAY_AUTH: [500, 'Payments are misconfigured at our end. Please try again shortly.']
};

/** Turns an API error into a response, keeping internals out of the body. */
function onError(res, err) {
  const status = err && err.statusCode ? err.statusCode : 500;

  const safe = err && err.code && SAFE_5XX[err.code];
  if (safe) {
    // Already logged with its cause where it was raised.
    return fail(res, safe[0], safe[1], { code: err.code });
  }

  if (status >= 500) {
    console.error('[api]', err);
    return fail(res, 500, 'Something went wrong at our end. Please try again.');
  }
  return fail(res, status, err.message);
}

/* --- Field validation ---------------------------------------------------- */

const trim = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

function text(value, { field, min = 1, max = 200, required = true }) {
  const v = trim(value).replace(/\s+/g, ' ');
  if (!v) {
    if (required) throw badRequest(`${field} is required.`);
    return '';
  }
  if (v.length < min) throw badRequest(`${field} looks too short.`);
  if (v.length > max) throw badRequest(`${field} must be ${max} characters or fewer.`);
  return v;
}

function email(value) {
  const v = trim(value).toLowerCase();
  if (!v) throw badRequest('Email is required.');
  if (v.length > 200 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) {
    throw badRequest('That email address does not look right.');
  }
  return v;
}

/** Indian mobile number: ten digits starting 6-9, with an optional +91. */
function phone(value) {
  const digits = trim(value).replace(/[\s()-]/g, '');
  const m = /^(?:\+?91)?([6-9]\d{9})$/.exec(digits);
  if (!m) throw badRequest('Enter a 10-digit Indian mobile number.');
  return m[1];
}

/* We deliver across India, so the PIN is a format check rather than a
   serviceability gate: six digits, and the first is never 0 because that range
   was never allocated. The same rule is a check constraint on the table,
   because that is the one the browser cannot talk its way past — see
   docs/migrate-pan-india.sql, which has to be run before this goes live or a
   PIN outside Bengaluru is refused by the database after the customer has
   paid. */
function pincode(value) {
  const v = trim(value);
  if (!/^\d{6}$/.test(v)) throw badRequest('Enter a 6-digit PIN code.');
  if (!/^[1-9]\d{5}$/.test(v)) throw badRequest('That is not a valid Indian PIN code — it cannot start with a zero.');
  return v;
}

function quantity(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw badRequest('Quantity must be a whole number between 1 and 20.');
  }
  return n;
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

module.exports = {
  readJson, send, fail, guard, onError, badRequest,
  text, email, phone, pincode, quantity
};
