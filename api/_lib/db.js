'use strict';

/**
 * Postgres access for the pre-order API.
 *
 * Files under api/_lib are ignored by Vercel's function builder, so this is a
 * plain module shared by the three handlers rather than a route of its own.
 *
 * Works against any Postgres — Neon, Supabase, Vercel Postgres, Railway, or a
 * local server during development. Connecting one through Vercel's marketplace
 * is enough: see connectionString() for the variable names that are accepted.
 * Prefer a *pooled* string, since serverless invocations are short-lived and
 * each one would otherwise hold a direct connection open.
 *
 * Money is stored as an integer number of paise. Floating point rupees drift
 * once you start summing line items, and this table is the order record.
 */

const { Pool } = require('pg');

const SEED_PRODUCTS = [
  { slug: 'masala-bhujia',         name: 'Masala Bhujia',         price_paise: 9900, pack_size: '60 g', protein: '14 g', sort_order: 1 },
  { slug: 'pudina-bhujia',         name: 'Pudina Bhujia',         price_paise: 9900, pack_size: '60 g', protein: '14 g', sort_order: 2 },
  { slug: 'sweet-chilli-chakli',   name: 'Sweet Chilli Chakli',   price_paise: 8900, pack_size: '50 g', protein: '9 g',  sort_order: 3 },
  { slug: 'cheddar-cheese-chakli', name: 'Cheddar Cheese Chakli', price_paise: 8900, pack_size: '50 g', protein: '9 g',  sort_order: 4 },
  { slug: 'korean-bbq-peanuts',    name: 'Korean BBQ Peanuts',    price_paise: 9900, pack_size: '65 g', protein: '18 g', sort_order: 5 }
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    pack_size   TEXT NOT NULL DEFAULT '',
    protein     TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'available',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS preorders (
    id            SERIAL PRIMARY KEY,
    reference     TEXT UNIQUE NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    customer_name TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL,
    address1      TEXT NOT NULL,
    address2      TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL,
    state         TEXT NOT NULL,
    pincode       TEXT NOT NULL,
    notes         TEXT NOT NULL DEFAULT '',
    items         JSONB NOT NULL,
    total_paise   INTEGER NOT NULL CHECK (total_paise >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS preorders_created_idx ON preorders (created_at DESC);
  CREATE INDEX IF NOT EXISTS preorders_status_idx  ON preorders (status);
`;

const URL_VARS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL_UNPOOLED'
];

const IS_PG_URL = /^postgres(ql)?:\/\//i;

/**
 * The connection string, however the provider chose to name it.
 *
 * Guessing names does not work: Vercel's marketplace lets you pick a prefix
 * when connecting a database, so Supabase can arrive as POSTGRES_URL,
 * SUPABASE_POSTGRES_URL, or anything else. So the known names are tried first
 * and then *any* variable whose value is a Postgres URL, which covers every
 * prefix and provider. Finally the pieces are assembled by hand, for
 * integrations that inject host/user/password/database separately and no URL.
 */
function connectionString() {
  for (const name of URL_VARS) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }

  // Any variable holding a Postgres URL. Pooled hosts first: serverless
  // invocations are short-lived and would exhaust a direct connection limit.
  const found = Object.keys(process.env)
    .filter((name) => IS_PG_URL.test((process.env[name] || '').trim()))
    .sort((a, b) => score(b) - score(a));
  if (found.length) return process.env[found[0]].trim();

  return assembled();
}

function score(name) {
  const value = process.env[name] || '';
  let n = 0;
  if (/pooler|pgbouncer/i.test(value)) n += 4;      // a pooled host
  if (/NON_POOLING|UNPOOLED|DIRECT/i.test(name)) n -= 4;
  if (/PRISMA/i.test(name)) n -= 1;                 // carries Prisma-only params
  if (/^(DATABASE|POSTGRES)_URL$/i.test(name)) n += 2;
  return n;
}

/** Builds a URL from separately injected parts, if a provider does that. */
function assembled() {
  const pick = (suffix) => {
    const key = Object.keys(process.env)
      .filter((name) => name.toUpperCase().endsWith(suffix))
      .sort((a, b) => a.length - b.length)[0];
    return key ? (process.env[key] || '').trim() : '';
  };

  const host = pick('POSTGRES_HOST');
  const user = pick('POSTGRES_USER');
  const password = pick('POSTGRES_PASSWORD');
  const database = pick('POSTGRES_DATABASE') || pick('POSTGRES_DB');
  if (!host || !user || !password) return '';

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
    `@${host}/${encodeURIComponent(database || 'postgres')}`;
}

/**
 * Names — never values — of the variables that look database-related, so the
 * admin panel can say what it can actually see when nothing works. Values hold
 * the password, so they never leave the server.
 */
function visibleVars() {
  return Object.keys(process.env)
    .filter((name) => /POSTGRES|DATABASE|SUPABASE|NEON|PG(HOST|USER|DATABASE|PORT)/i.test(name))
    .filter((name) => !/PASSWORD|SECRET|KEY|TOKEN/i.test(name))
    .sort();
}

/**
 * One pool per warm container. Vercel may reuse a container across
 * invocations, so caching on globalThis avoids opening a new pool each time.
 */
function pool() {
  const url = connectionString();
  if (!url) {
    const err = new Error('No database is connected. See docs/ADMIN-SETUP.md.');
    err.statusCode = 503;
    err.code = 'NO_DATABASE';
    throw err;
  }

  if (!globalThis.__ppPool) {
    globalThis.__ppPool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      // Hosted Postgres terminates TLS with a certificate this process has no
      // root for; a local server usually has TLS off entirely.
      ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(url) ? false : { rejectUnauthorized: false }
    });
    globalThis.__ppPool.on('error', () => {
      // A pooled connection dropped while idle. node-postgres discards it and
      // opens a fresh one on the next query; crashing the process would be worse.
    });
  }
  return globalThis.__ppPool;
}

/**
 * Create the tables and seed the five launch products, once per container.
 * Idempotent, so concurrent cold starts racing each other is harmless — but
 * the cached promise keeps them from all paying for it.
 */
function ready() {
  if (!globalThis.__ppReady) {
    globalThis.__ppReady = (async () => {
      const p = pool();
      await p.query(SCHEMA);
      for (const s of SEED_PRODUCTS) {
        await p.query(
          `INSERT INTO products (slug, name, price_paise, pack_size, protein, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (slug) DO NOTHING`,
          [s.slug, s.name, s.price_paise, s.pack_size, s.protein, s.sort_order]
        );
      }
    })().catch((err) => {
      // Don't cache a failure — the next request should retry, otherwise one
      // blip at cold start bricks the container until it is recycled.
      globalThis.__ppReady = null;
      throw err;
    });
  }
  return globalThis.__ppReady;
}

async function query(text, params) {
  await ready();
  return pool().query(text, params);
}

/**
 * Actually connect, so the panel can tell "no variable" apart from "wrong
 * password" apart from "works". A string being present proves nothing.
 */
async function diagnose() {
  const url = connectionString();
  if (!url) return { ok: false, reason: 'missing', vars: visibleVars() };
  try {
    await pool().query('SELECT 1');
    return { ok: true, host: hostOf(url) };
  } catch (err) {
    const host = hostOf(url);
    return {
      ok: false,
      reason: 'failed',
      host,
      message: scrub(err.message),
      hint: explain(host, err)
    };
  }
}

/**
 * Turn a driver error into the thing to actually go and do.
 *
 * The first case is the one that catches people out: Supabase's *direct*
 * host, db.<ref>.supabase.co, resolves only over IPv6 on projects created
 * since early 2024, and Vercel's functions have no IPv6 egress. It looks like
 * a broken hostname but the connection details are perfectly correct — the
 * fix is to use the pooler host instead, which is reachable over IPv4.
 */
function explain(host, err) {
  const code = err && err.code;
  const message = String((err && err.message) || '');
  // host carries the port for display; match on the name alone.
  const name = String(host || '').replace(/:\d+$/, '');

  if (/^db\.[^.]+\.supabase\.co$/i.test(name) &&
      (code === 'ENOTFOUND' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH')) {
    return 'This is Supabase\u2019s direct connection host, which only answers over IPv6 — ' +
      'and Vercel functions cannot reach IPv6. Use the pooled string instead: in Supabase open ' +
      'Connect \u2192 Connection pooling and copy the Transaction pooler URI. Its host looks like ' +
      'aws-0-<region>.pooler.supabase.com on port 6543, and its username is postgres.<project-ref>. ' +
      'Put that in DATABASE_URL and redeploy.';
  }
  if (/password authentication failed/i.test(message) || code === '28P01') {
    return 'The host answered but rejected the password. Copy the connection string again from your ' +
      'database provider — if it contains [YOUR-PASSWORD] you need to substitute the real one.';
  }
  if (code === 'ENOTFOUND') {
    return 'That hostname does not resolve. Check the connection string was copied whole, with no ' +
      'line break in the middle.';
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
    return 'The host did not accept the connection. If your provider has network restrictions, ' +
      'it needs to allow connections from anywhere, since Vercel functions have no fixed IP.';
  }
  if (/self.signed|certificate/i.test(message)) {
    return 'A TLS problem. The connection string may need ?sslmode=require on the end.';
  }
  return '';
}

/** Host only — the rest of the string carries the password. */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Never let a connection string reach the browser, whatever the driver says. */
function scrub(message) {
  return String(message || '')
    .replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]')
    .slice(0, 300);
}

module.exports = {
  query, ready, pool, connectionString, visibleVars, diagnose, SEED_PRODUCTS
};
