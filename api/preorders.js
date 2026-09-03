'use strict';

/**
 * Pre-orders.
 *
 *   POST  /api/preorders                 → place one (public)
 *   GET   /api/preorders                 → list      (admin)
 *   GET   /api/preorders?format=csv      → export    (admin)
 *   PATCH /api/preorders  {id, status}   → move one  (admin)
 *
 * Prices are re-read from the products table when the order is written. The
 * browser sends slugs and quantities only — never an amount — so a tampered
 * request cannot invent its own total.
 */

const crypto = require('crypto');
const db = require('./_lib/db.js');
const auth = require('./_lib/auth.js');
const {
  readJson, send, guard, onError, badRequest,
  text, email, phone, pincode, quantity
} = require('./_lib/http.js');

const STATUSES = ['pending', 'confirmed', 'shipped', 'cancelled'];
const MAX_LINES = 10;

function requireAdmin(req) {
  const s = auth.session(req);
  if (!s) throw Object.assign(new Error('Please sign in again.'), { statusCode: 401 });
  return s;
}

/**
 * Order reference: PP- plus six characters. Digits 0/1 and letters I/O/S/Z are
 * left out so a reference read down the phone is not ambiguous.
 */
function reference() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRTUVWXY';
  let out = '';
  for (const byte of crypto.randomBytes(6)) out += alphabet[byte % alphabet.length];
  return `PP-${out}`;
}

function shape(row) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    customer_name: row.customer_name,
    email: row.email,
    phone: row.phone,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    notes: row.notes,
    items: row.items,
    total_paise: row.total_paise,
    total: row.total_paise / 100,
    created_at: row.created_at
  };
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Customer
  // names and addresses are untrusted input, so neutralise it.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const head = [
    'Reference', 'Placed', 'Status', 'Name', 'Email', 'Phone',
    'Address 1', 'Address 2', 'City', 'State', 'PIN', 'Items', 'Total (₹)', 'Notes'
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const r of rows) {
    const items = (r.items || []).map((i) => `${i.qty} × ${i.name}`).join('; ');
    lines.push([
      r.reference, new Date(r.created_at).toISOString(), r.status,
      r.customer_name, r.email, r.phone,
      r.address1, r.address2, r.city, r.state, r.pincode,
      items, (r.total_paise / 100).toFixed(2), r.notes
    ].map(csvCell).join(','));
  }
  // The BOM makes Excel open a UTF-8 file with ₹ and Devanagari intact.
  return '﻿' + lines.join('\r\n');
}

/** Turns [{slug, qty}] into priced line items using the current price list. */
async function priceItems(input) {
  if (!Array.isArray(input) || !input.length) throw badRequest('Choose at least one snack.');
  if (input.length > MAX_LINES) throw badRequest('That is more different snacks than we can take in one pre-order.');

  const wanted = new Map();
  for (const line of input) {
    const slug = String((line && line.slug) || '').trim().toLowerCase();
    if (!slug) throw badRequest('A snack was missing from the order.');
    const qty = quantity(line.qty);
    wanted.set(slug, (wanted.get(slug) || 0) + qty);
  }
  for (const qty of wanted.values()) {
    if (qty > 20) throw badRequest('Quantity must be a whole number between 1 and 20.');
  }

  const { rows } = await db.query(
    'SELECT slug, name, price_paise, status FROM products WHERE slug = ANY($1)',
    [[...wanted.keys()]]
  );
  const found = new Map(rows.map((r) => [r.slug, r]));

  const items = [];
  let total = 0;
  for (const [slug, qty] of wanted) {
    const product = found.get(slug);
    if (!product) throw badRequest('One of those snacks is no longer listed.');
    if (product.status !== 'available') throw badRequest(`${product.name} is not available for pre-order right now.`);
    total += product.price_paise * qty;
    items.push({ slug, name: product.name, qty, price_paise: product.price_paise });
  }
  return { items, total };
}

module.exports = async function handler(req, res) {
  if (guard(req, res, ['GET', 'POST', 'PATCH'])) return;

  try {
    if (req.method === 'POST') {
      const body = await readJson(req);
      const { items, total } = await priceItems(body.items);

      const { rows } = await db.query(
        `INSERT INTO preorders
           (reference, customer_name, email, phone, address1, address2,
            city, state, pincode, notes, items, total_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          reference(),
          text(body.customer_name, { field: 'Full name', min: 2, max: 80 }),
          email(body.email),
          phone(body.phone),
          text(body.address1, { field: 'Address', min: 4, max: 160 }),
          text(body.address2, { field: 'Address line 2', max: 160, required: false }),
          text(body.city, { field: 'City', max: 60 }),
          text(body.state, { field: 'State', max: 60 }),
          pincode(body.pincode),
          text(body.notes, { field: 'Notes', max: 500, required: false }),
          JSON.stringify(items),
          total
        ]
      );

      const order = shape(rows[0]);
      // The public response deliberately echoes back only what the customer
      // needs to see on the confirmation screen.
      return send(res, 201, {
        reference: order.reference,
        items: order.items,
        total: order.total,
        status: order.status
      });
    }

    requireAdmin(req);

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status');
      const format = url.searchParams.get('format');

      if (status && !STATUSES.includes(status)) throw badRequest('Unknown status filter.');

      const { rows } = status
        ? await db.query('SELECT * FROM preorders WHERE status = $1 ORDER BY created_at DESC', [status])
        : await db.query('SELECT * FROM preorders ORDER BY created_at DESC');

      if (format === 'csv') {
        const stamp = new Date().toISOString().slice(0, 10);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', `attachment; filename="preorders-${stamp}.csv"`);
        return res.end(toCsv(rows));
      }

      const counts = STATUSES.reduce((acc, s) => Object.assign(acc, { [s]: 0 }), {});
      const all = status
        ? (await db.query('SELECT status FROM preorders')).rows
        : rows;
      for (const r of all) if (counts[r.status] !== undefined) counts[r.status] += 1;

      return send(res, 200, { preorders: rows.map(shape), counts });
    }

    // PATCH — move an order through the queue.
    const body = await readJson(req);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) throw badRequest('A valid order id is required.');
    const next = String(body.status || '').toLowerCase();
    if (!STATUSES.includes(next)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}.`);

    const { rows } = await db.query(
      'UPDATE preorders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [next, id]
    );
    if (!rows.length) throw Object.assign(new Error('No such pre-order.'), { statusCode: 404 });
    return send(res, 200, { preorder: shape(rows[0]) });
  } catch (err) {
    return onError(res, err);
  }
};
