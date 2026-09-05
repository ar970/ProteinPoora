'use strict';

/**
 * Pre-orders.
 *
 *   POST  /api/preorders                 → place one

Reading orders back is not something this file does. Orders are read in
Supabase, by the one person signed in to it.
 *
 * Prices are re-read from the products table when the order is written. The
 * browser sends slugs and quantities only — never an amount — so a tampered
 * request cannot invent its own total.
 */

const crypto = require('crypto');
const db = require('./_lib/db.js');
const {
  readJson, send, guard, onError, badRequest,
  text, email, phone, pincode, quantity
} = require('./_lib/http.js');

const MAX_LINES = 10;

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
  if (guard(req, res, ['POST'])) return;

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

  } catch (err) {
    return onError(res, err);
  }
};
