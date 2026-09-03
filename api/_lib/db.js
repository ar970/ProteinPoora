'use strict';

/**
 * Postgres access for the pre-order API.
 *
 * Files under api/_lib are ignored by Vercel's function builder, so this is a
 * plain module shared by the three handlers rather than a route of its own.
 *
 * Works against any Postgres — Neon, Supabase, Vercel Postgres, Railway, or a
 * local server during development. Set DATABASE_URL to a *pooled* connection
 * string: serverless invocations are short-lived and each one would otherwise
 * hold a direct connection open.
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

/**
 * One pool per warm container. Vercel may reuse a container across
 * invocations, so caching on globalThis avoids opening a new pool each time.
 */
function pool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error('DATABASE_URL is not set. See docs/ADMIN-SETUP.md.');
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

module.exports = { query, ready, pool, SEED_PRODUCTS };
