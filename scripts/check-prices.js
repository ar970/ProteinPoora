'use strict';

/**
 * Every price is written down three times. This fails the build if they ever
 * stop agreeing.
 *
 *   api/_lib/catalogue.js      what the server charges — the only one that
 *                              decides money
 *   preorder/index.html        the #catalogue JSON the picker renders from
 *   index.html                 data-price-paise on each Add to cart
 *
 * There is no build step to generate one from the others, and the server
 * cannot price an order from a file the customer can edit, so the duplication
 * is deliberate. What is not acceptable is the three drifting apart quietly:
 * a card that says ₹99 while the modal charges ₹149 is a chargeback.
 *
 *   node scripts/check-prices.js     (also: npm run check:prices)
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function fromServer() {
  const { PRICES } = require(path.join(root, 'api/_lib/catalogue.js'));
  return new Map(Object.entries(PRICES));
}

function fromPicker() {
  const html = read('preorder/index.html');
  const m = /<script[^>]*id="catalogue"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('preorder/index.html: no #catalogue block found');
  const rows = JSON.parse(m[1]);
  return new Map(rows.map((r) => [r.slug, r.price_paise]));
}

function fromCards() {
  const html = read('index.html');
  const out = new Map();
  const re = /data-add-to-cart="([^"]+)"[^>]*?data-price-paise="(\d+)"/g;
  let m;
  while ((m = re.exec(html))) out.set(m[1], Number(m[2]));
  if (!out.size) throw new Error('index.html: no data-add-to-cart prices found');
  return out;
}

const sources = [
  ['api/_lib/catalogue.js', fromServer()],
  ['preorder/index.html', fromPicker()],
  ['index.html', fromCards()]
];

const problems = [];
const [, server] = sources[0];

for (const [label, prices] of sources.slice(1)) {
  for (const [slug, paise] of prices) {
    if (!server.has(slug)) {
      problems.push(`${label}: "${slug}" is not priced in api/_lib/catalogue.js`);
    } else if (server.get(slug) !== paise) {
      problems.push(
        `${label}: "${slug}" is ${paise} paise, but the server charges ${server.get(slug)}`
      );
    }
  }
}

// The homepage does not have to list every slug, but the picker does: it is
// the checkout, and a slug it cannot show is a slug nobody can buy.
const [, picker] = sources[1];
for (const slug of server.keys()) {
  if (!picker.has(slug)) {
    problems.push(`preorder/index.html: "${slug}" is priced on the server but not in the picker`);
  }
}

if (problems.length) {
  console.error('Prices disagree:\n  ' + problems.join('\n  '));
  process.exit(1);
}

console.log(`prices agree across all three sources (${server.size} slugs)`);
