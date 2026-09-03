'use strict';

/**
 * Products — the commercial side of each snack: price, pack size, protein
 * figure and whether it can be pre-ordered.
 *
 *   GET    /api/products      → list (public sees available + sold-out only)
 *   POST   /api/products      → create           (admin)
 *   PATCH  /api/products      → update by id     (admin)
 *   DELETE /api/products      → delete by id     (admin)
 *
 * Marketing content — photography, ingredients, the nutrition table — stays in
 * the page markup, because that is where it has to live once these pages
 * become Liquid templates. Shopify owns price and availability; the theme owns
 * the story. This table is deliberately the same split.
 */

const db = require('./_lib/db.js');
const auth = require('./_lib/auth.js');
const { readJson, send, guard, onError, badRequest, text } = require('./_lib/http.js');

const STATUSES = ['available', 'sold_out', 'hidden'];
const PUBLIC_STATUSES = ['available', 'sold_out'];

function requireAdmin(req) {
  const s = auth.session(req);
  if (!s) throw Object.assign(new Error('Please sign in again.'), { statusCode: 401 });
  return s;
}

function shape(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    price_paise: row.price_paise,
    price: row.price_paise / 100,
    pack_size: row.pack_size,
    protein: row.protein,
    status: row.status,
    sort_order: row.sort_order
  };
}

/** Accepts "99", "99.50" or "₹99" and returns integer paise. */
function priceToPaise(value) {
  const cleaned = String(value == null ? '' : value).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw badRequest('Price must be a number, for example 99 or 99.50.');
  }
  const paise = Math.round(Number(cleaned) * 100);
  if (paise > 100000000) throw badRequest('That price is implausibly large.');
  return paise;
}

function statusOf(value) {
  const v = String(value || '').toLowerCase();
  if (!STATUSES.includes(v)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}.`);
  return v;
}

function slugOf(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) || v.length > 80) {
    throw badRequest('Slug must be lowercase words joined by hyphens, e.g. masala-bhujia.');
  }
  return v;
}

function idOf(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest('A valid product id is required.');
  return n;
}

/** Position in the line-up. Independent of quantity limits — it just sorts. */
function sortOf(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw badRequest('Order must be a whole number between 0 and 9999.');
  }
  return n;
}

module.exports = async function handler(req, res) {
  if (guard(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;

  try {
    if (req.method === 'GET') {
      // The full list, hidden products included, is opt-in via ?all=1 and only
      // for an admin. Without it this always returns the public list — so the
      // storefront looks the same to the admin's browser as to a customer's,
      // rather than quietly showing them rows nobody else can see.
      const wantsAll = new URL(req.url, 'http://localhost').searchParams.get('all') === '1';
      const showAll = wantsAll && Boolean(auth.session(req));

      const { rows } = showAll
        ? await db.query('SELECT * FROM products ORDER BY sort_order, id')
        : await db.query(
            'SELECT * FROM products WHERE status = ANY($1) ORDER BY sort_order, id',
            [PUBLIC_STATUSES]
          );
      return send(res, 200, { products: rows.map(shape) });
    }

    requireAdmin(req);
    const body = await readJson(req);

    if (req.method === 'POST') {
      const slug = slugOf(body.slug);
      const { rows } = await db.query(
        `INSERT INTO products (slug, name, price_paise, pack_size, protein, status, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO NOTHING
         RETURNING *`,
        [
          slug,
          text(body.name, { field: 'Name', max: 80 }),
          priceToPaise(body.price),
          text(body.pack_size, { field: 'Pack size', max: 20, required: false }),
          text(body.protein, { field: 'Protein', max: 20, required: false }),
          body.status === undefined ? 'available' : statusOf(body.status),
          body.sort_order === undefined ? 99 : sortOf(body.sort_order)
        ]
      );
      if (!rows.length) throw badRequest(`A product with the slug "${slug}" already exists.`);
      return send(res, 201, { product: shape(rows[0]) });
    }

    if (req.method === 'PATCH') {
      const id = idOf(body.id);

      // Build the update from only the fields actually supplied, so the panel
      // can send one changed cell without clobbering the rest of the row.
      const sets = [];
      const values = [];
      const set = (col, val) => { values.push(val); sets.push(`${col} = $${values.length}`); };

      if (body.name !== undefined) set('name', text(body.name, { field: 'Name', max: 80 }));
      if (body.price !== undefined) set('price_paise', priceToPaise(body.price));
      if (body.pack_size !== undefined) set('pack_size', text(body.pack_size, { field: 'Pack size', max: 20, required: false }));
      if (body.protein !== undefined) set('protein', text(body.protein, { field: 'Protein', max: 20, required: false }));
      if (body.status !== undefined) set('status', statusOf(body.status));
      if (body.sort_order !== undefined) set('sort_order', sortOf(body.sort_order));
      if (!sets.length) throw badRequest('Nothing to update.');

      sets.push('updated_at = now()');
      values.push(id);
      const { rows } = await db.query(
        `UPDATE products SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows.length) throw Object.assign(new Error('No such product.'), { statusCode: 404 });
      return send(res, 200, { product: shape(rows[0]) });
    }

    // DELETE. Past pre-orders keep their own copy of the line items, so
    // removing a product never rewrites an order that has already been placed.
    const id = idOf(body.id);
    const { rows } = await db.query('DELETE FROM products WHERE id = $1 RETURNING slug', [id]);
    if (!rows.length) throw Object.assign(new Error('No such product.'), { statusCode: 404 });
    return send(res, 200, { deleted: rows[0].slug });
  } catch (err) {
    return onError(res, err);
  }
};
