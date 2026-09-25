/**
 * Is the orders table actually ready to take an order?
 *
 *   node scripts/check-supabase.mjs            read-only, safe on production
 *   node scripts/check-supabase.mjs --write    also places and deletes a test row
 *
 * Reads the project URL and anon key straight out of assets/js/store-config.js,
 * so it checks the same table the website writes to rather than one you typed
 * in again.
 *
 * What it is for: a customer pays through Razorpay and only then does the
 * browser write the order row. If that write fails -- a missing column, a
 * check constraint, an insert policy that was never applied -- the money is
 * gone and the order is not recorded. That failure is invisible until it
 * happens to somebody real, so it is worth one command beforehand.
 *
 * The --write test needs the service role key to clean up after itself, since
 * the public key may insert and nothing else. Without it the row is left for
 * you to delete by hand, and the script says so.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

/* --- what the site is configured to talk to ------------------------------ */

const config = readFileSync(join(root, 'assets/js/store-config.js'), 'utf8');
const block = config.slice(config.indexOf('window.PP_SUPABASE'));
const pick = (key) => (block.match(new RegExp(`${key}:\\s*'([^']+)'`)) || [])[1];

const url = (pick('url') || '').replace(/\/+$/, '');
const anonKey = pick('anonKey');
const table = pick('table') || 'preorders';

if (!url || !anonKey) {
  console.error('store-config.js has no Supabase url/anonKey. The site would fall back to /api/preorders.');
  process.exit(1);
}
console.log(`project ${url}`);
console.log(`table   ${table}\n`);

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  'Content-Type': 'application/json'
};

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { failures += 1; console.log(`  FAIL  ${m}`); };

/* Reaching the project is a different problem from the table being wrong, and
   reporting a blocked network as a missing column sends you to fix the wrong
   thing. Settle it once, before any of the checks below. */
try {
  const res = await fetch(`${url}/rest/v1/`, { headers });
  const body = res.ok ? '' : await res.text();
  if (/not in allowlist|egress|blocked/i.test(body)) {
    console.log('This machine cannot reach Supabase — a proxy or egress policy is refusing it,');
    console.log('so nothing below would mean anything. Run this somewhere with normal network');
    console.log(`access, or allow ${new URL(url).host}.\n`);
    console.log(`  (the project said: ${body.trim().slice(0, 140)})`);
    process.exit(2);
  }
} catch (err) {
  console.log(`Could not reach ${url} at all: ${err.message}`);
  console.log('Check the URL in assets/js/store-config.js, and this machine\'s network.');
  process.exit(2);
}

/* --- 1. the columns the checkout writes ---------------------------------- */

// Every column assets/js/preorder.js sends. A missing one is a rejected row
// after a successful payment.
const REQUIRED = [
  'reference', 'status', 'customer_name', 'email', 'phone',
  'address1', 'address2', 'city', 'state', 'pincode', 'notes',
  'items', 'total_paise',
  'razorpay_order_id', 'razorpay_payment_id', 'paid_paise'
];

console.log('schema');
let schema = null;
try {
  const res = await fetch(`${url}/rest/v1/`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const doc = await res.json();
  schema = doc?.definitions?.[table] || doc?.components?.schemas?.[table] || null;
} catch (err) {
  bad(`could not read the API schema: ${err.message}`);
}

if (schema) {
  const columns = Object.keys(schema.properties || {});
  const missing = REQUIRED.filter((c) => !columns.includes(c));
  if (missing.length) {
    bad(`missing column(s): ${missing.join(', ')}`);
    console.log('        → run the alter table at the bottom of docs/supabase-setup.sql');
  } else {
    ok(`all ${REQUIRED.length} columns the checkout writes are present`);
  }
} else if (!failures) {
  bad(`table "${table}" is not exposed by the API — wrong name, or it does not exist`);
}

/* --- 2. the insert policy and the PIN constraint ------------------------- */

const row = (pin) => ({
  reference: `PP-TEST${Date.now().toString(36).slice(-4).toUpperCase()}`,
  status: 'test',
  customer_name: 'Setup check — delete me',
  email: 'setup-check@example.com',
  phone: '9999999999',
  address1: 'Automated check from scripts/check-supabase.mjs',
  address2: '', city: 'Delhi', state: 'Delhi',
  pincode: pin, notes: 'safe to delete',
  items: [{ slug: 'masala-bhujia', name: 'Masala Bhujia', qty: 1, price_paise: 9900 }],
  total_paise: 9900,
  razorpay_order_id: null, razorpay_payment_id: null, paid_paise: null
});

const insert = (body, extra = {}) =>
  fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation', ...extra },
    body: JSON.stringify(body)
  });

console.log('\nPIN code rule');
try {
  /* We deliver across India now, so what this proves has flipped: the rule
     should refuse a malformed PIN and nothing else. 060001 is the test because
     no Indian PIN starts with a zero, so a table that takes it has no rule at
     all — and, unlike a Delhi PIN, it cannot accidentally be a real order. */
  const res = await insert(row('060001'));
  if (res.ok) {
    bad('the table accepted 060001 — there is no PIN rule on it at all');
    console.log('        → run docs/migrate-pan-india.sql');
    const [created] = await res.json().catch(() => []);
    if (created?.id) console.log(`        → and delete the row it just made (id ${created.id})`);
  } else {
    const body = await res.text();
    if (/violates check constraint|pincode/i.test(body)) {
      ok('a malformed PIN code is refused by the table itself');
    } else {
      bad(`refused, but not by the PIN rule — ${res.status}: ${body.slice(0, 160)}`);
    }
  }
} catch (err) {
  bad(`could not reach the table: ${err.message}`);
}

console.log('\ninsert policy');
if (!WRITE) {
  console.log('  skip  pass --write to place and then remove a real test order');
} else {
  try {
    // Deliberately a Delhi PIN: this is the one check that proves the
    // pan-India migration actually ran against the live table.
    const res = await insert(row('110001'));
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      bad(`a Delhi order was refused — ${res.status}: ${body}`);
      console.log(/pincode|check constraint/i.test(body)
        ? '        → the table still has the Bengaluru-only PIN rule. Run docs/migrate-pan-india.sql.'
        : '        → the anon insert policy in docs/supabase-setup.sql is missing');
    } else {
      const [created] = await res.json().catch(() => []);
      ok(`a Delhi order inserts — delivery is open across India${created?.id ? ` (id ${created.id})` : ''}`);

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        console.log(`  note  left behind for you to delete: reference ${JSON.stringify(created?.reference)}`);
        console.log('        the public key may insert and nothing else, so it cannot tidy up.');
        console.log('        set SUPABASE_SERVICE_ROLE_KEY to have this script delete it.');
      } else {
        const del = await fetch(`${url}/rest/v1/${table}?id=eq.${created.id}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        if (del.ok) ok('test order removed again');
        else bad(`could not remove the test order (${del.status}) — delete id ${created.id} by hand`);
      }
    }
  } catch (err) {
    bad(`insert failed: ${err.message}`);
  }
}

console.log(failures ? `\n${failures} problem(s) — the checkout would lose orders.` : '\nSupabase is ready to take orders.');
process.exit(failures ? 1 : 0);
