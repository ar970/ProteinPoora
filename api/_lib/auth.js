'use strict';

/**
 * Admin authentication.
 *
 * Sign-in works out of the box using the built-in credentials below, and
 * ADMIN_USERNAME / ADMIN_PASSWORD in the environment override them. See the
 * note on those constants for why a default exists at all and what it costs.
 *
 * A session is a cookie holding `base64url(payload).base64url(HMAC)`. Nothing
 * is stored server-side: the signature is what makes it trustworthy, and the
 * expiry travels inside the signed payload so it cannot be edited.
 */

const crypto = require('crypto');

const COOKIE = 'pp_admin';
const TTL_MS = 8 * 60 * 60 * 1000; // one working day

/**
 * Built-in sign-in, so the panel works the moment the site deploys.
 *
 * These are in the source, which means they are in a public repository and
 * anyone who looks can read them. That is a deliberate trade, made because the
 * alternative was a panel that could not be opened at all. Setting
 * ADMIN_USERNAME and ADMIN_PASSWORD in Vercel overrides both and takes the
 * secret back out of the repo; the panel says so on every screen until you do.
 */
const DEFAULT_USERNAME = 'archit';
const DEFAULT_PASSWORD = 'proteinpoora123';

function credentials() {
  const username = process.env.ADMIN_USERNAME || DEFAULT_USERNAME;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  return {
    username,
    password,
    configured: true,
    // True while the password is the one anybody can read in the repository.
    isDefault: password === DEFAULT_PASSWORD
  };
}

/**
 * Signing key. Deriving it from the credentials when ADMIN_SESSION_SECRET is
 * unset means one less variable to configure, and changing the password
 * invalidates every outstanding session — which is what you want from a
 * password change anyway.
 */
function secret() {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit) return explicit;
  const { username, password } = credentials();
  return crypto.createHash('sha256').update(`pp:${username}:${password}`).digest('hex');
}

/**
 * Compare without leaking length or position of the first difference.
 * Hashing first gives timingSafeEqual the equal-length buffers it requires.
 */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

function issue(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + TTL_MS })
  ).toString('base64url');

  const value = `${payload}.${sign(payload)}`;
  const parts = [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`
  ];
  // Vercel always serves https; plain http is only ever local development,
  // where a Secure cookie would simply be dropped.
  if (process.env.NODE_ENV !== 'development') parts.push('Secure');
  return parts.join('; ');
}

function clear() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    out[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  return out;
}

/** Returns { username } for a valid unexpired session, otherwise null. */
function session(req) {
  if (!credentials().configured) return null;

  const raw = parseCookies(req.headers && req.headers.cookie)[COOKIE];
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;

  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  let expected;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;

  // A password change rotates the derived key, but be explicit: a session
  // naming a different user than the one now configured is not valid.
  if (data.u !== credentials().username) return null;

  return { username: data.u };
}

function verify(username, password) {
  const creds = credentials();
  if (!creds.configured) return false;
  // Evaluate both halves rather than short-circuiting, so a wrong username and
  // a wrong password cost the same.
  const userOk = sameSecret(username, creds.username);
  const passOk = sameSecret(password, creds.password);
  return userOk && passOk;
}

module.exports = { COOKIE, credentials, issue, clear, session, verify };
