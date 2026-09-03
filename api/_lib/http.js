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

/** Turns an API error into a response, keeping internals out of the body. */
function onError(res, err) {
  const status = err && err.statusCode ? err.statusCode : 500;
  if (err && err.code === 'NO_DATABASE') {
    return fail(res, 503, 'The store database is not configured yet.', { code: 'NO_DATABASE' });
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

function pincode(value) {
  const v = trim(value);
  if (!/^[1-9]\d{5}$/.test(v)) throw badRequest('Enter a 6-digit PIN code.');
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
