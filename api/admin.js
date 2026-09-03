'use strict';

/**
 * Admin session: log in, log out, and report who is signed in.
 *
 *   GET  /api/admin                              → session state
 *   POST /api/admin  {action:"login", ...}       → sets the session cookie
 *   POST /api/admin  {action:"logout"}           → clears it
 */

const auth = require('./_lib/auth.js');
const { readJson, send, fail, guard, onError, badRequest } = require('./_lib/http.js');

// Throttling lives in the container's memory, so it slows an attacker down
// rather than stopping one outright — Vercel may hand the next attempt to a
// different instance. It costs nothing and blunts casual guessing; the real
// protection is a password that isn't in the repository.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function attemptsFor(ip) {
  if (!globalThis.__ppLoginAttempts) globalThis.__ppLoginAttempts = new Map();
  const store = globalThis.__ppLoginAttempts;
  const now = Date.now();

  for (const [key, rec] of store) {
    if (now - rec.first > WINDOW_MS) store.delete(key);
  }
  let rec = store.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    rec = { count: 0, first: now };
    store.set(ip, rec);
  }
  return rec;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  if (guard(req, res, ['GET', 'POST'])) return;

  try {
    const configured = auth.credentials().configured;

    if (req.method === 'GET') {
      const s = auth.session(req);
      return send(res, 200, {
        configured,
        // The panel is the place the setup is explained, so it needs to know
        // about the database too — not just about the credentials.
        database: Boolean(process.env.DATABASE_URL),
        authenticated: Boolean(s),
        username: s ? s.username : null
      });
    }

    const body = await readJson(req);
    const action = String(body.action || '').toLowerCase();

    if (action === 'logout') {
      return send(res, 200, { authenticated: false }, { 'Set-Cookie': auth.clear() });
    }

    if (action !== 'login') throw badRequest('Unknown action.');

    if (!configured) {
      return fail(
        res, 503,
        'Admin sign-in is not configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD in the Vercel project.',
        { code: 'NOT_CONFIGURED' }
      );
    }

    const rec = attemptsFor(clientIp(req));
    if (rec.count >= MAX_ATTEMPTS) {
      const mins = Math.ceil((WINDOW_MS - (Date.now() - rec.first)) / 60000);
      return fail(res, 429, `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }

    if (!auth.verify(body.username, body.password)) {
      rec.count += 1;
      await pause(400); // blunt the rate of online guessing
      return fail(res, 401, 'Wrong username or password.');
    }

    rec.count = 0;
    const username = auth.credentials().username;
    return send(res, 200, { authenticated: true, username }, { 'Set-Cookie': auth.issue(username) });
  } catch (err) {
    return onError(res, err);
  }
};
