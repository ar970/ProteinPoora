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

const catalogue = require(path.join(root, 'api/_lib/catalogue.js'));

/** Everything the server will price, combos and loose packs alike. */
function fromServer() {
  const out = new Map(Object.entries(catalogue.PRICES));
  for (const slug of Object.keys(catalogue.BOX_PACKS)) out.set(slug, catalogue.BOX_RATE_PAISE);
  return out;
}

function fromPicker() {
  const html = read('preorder/index.html');
  const m = /<script[^>]*id="catalogue"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('preorder/index.html: no #catalogue block found');
  const rows = JSON.parse(m[1]);
  return new Map(rows.map((r) => [r.slug, r.price_paise]));
}

function fromCartGuard() {
  const js = read('assets/js/cart.js');
  // ORDERABLE is the combos plus BOX_PACKS, so both arrays have to be read.
  const slugs = [];
  for (const name of ['BOX_PACKS', 'ORDERABLE']) {
    const m = new RegExp('var ' + name + ' = \\[([^\\]]*)\\]').exec(js);
    if (!m) throw new Error(`assets/js/cart.js: no ${name} list found`);
    for (const s of m[1].split(',')) {
      const slug = s.trim().replace(/^'|'$/g, '');
      if (slug) slugs.push(slug);
    }
  }
  return new Set(slugs);
}

function fromCards() {
  const html = read('index.html');
  const out = new Map();
  // Combo cards carry data-add-to-cart; box-builder rows carry data-box-pack.
  // Both put a price in front of the customer, so both have to be right.
  for (const attr of ['data-add-to-cart', 'data-box-pack']) {
    const re = new RegExp(attr + '="([^"]+)"[\\s\\S]*?data-price-paise="(\\d+)"', 'g');
    let m;
    while ((m = re.exec(html))) out.set(m[1], Number(m[2]));
  }
  if (!out.size) throw new Error('index.html: no priced cards found');
  return out;
}

/**
 * Delivery, written down wherever the customer is quoted it. A page promising
 * free delivery over ₹400 while the server wants ₹500 is a number that changes
 * at the payment window, which is the moment a customer decides you are not
 * to be trusted.
 */
function deliveryQuotes() {
  const cart = read('assets/js/cart.js');
  const home = read('index.html');
  const checkout = read('preorder/index.html');
  // "₹100," in prose captures its trailing comma, and "₹1,000" its separator.
  // Both come out right once commas are gone.
  const rupees = (re, text) =>
    Number(String((re.exec(text) || [])[1]).replace(/,/g, '')) * 100;

  return {
    threshold: [
      ['api/_lib/catalogue.js', catalogue.FREE_DELIVERY_FROM_PAISE],
      ['assets/js/cart.js', Number((/var FREE_DELIVERY_FROM = (\d+)/.exec(cart) || [])[1])],
      ['index.html copy', rupees(/Free delivery over ₹([\d,]+)/, home)],
      ['index.html FAQ', rupees(/Free on orders of ₹([\d,]+) or more/, home)],
      ['preorder/index.html copy', rupees(/Delivery is free on orders of ₹([\d,]+) or more/, checkout)]
    ],
    charge: [
      ['api/_lib/catalogue.js', catalogue.DELIVERY_PAISE],
      ['assets/js/cart.js', Number((/var DELIVERY = (\d+)/.exec(cart) || [])[1])],
      ['index.html FAQ', rupees(/Below that it is ₹([\d,]+)/, home)],
      ['preorder/index.html copy', rupees(/or more, ₹([\d,]+) below that/, checkout)]
    ]
  };
}

/** The minimum, written down in four places. They have to be one number. */
function boxMinimums() {
  return [
    ['api/_lib/catalogue.js', catalogue.BOX_MIN_PACKS],
    ['assets/js/cart.js', Number((/var BOX_MIN = (\d+)/.exec(read('assets/js/cart.js')) || [])[1])],
    ['index.html data-box-min', Number((/data-box-min="(\d+)"/.exec(read('index.html')) || [])[1])],
    ['index.html copy', Number((/Any (\d+) packs or more/.exec(read('index.html')) || [])[1])],
    ['preorder/index.html copy', Number((/build a box from (\d+) loose packs/.exec(read('preorder/index.html')) || [])[1])]
  ];
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

// The cart drops anything outside its own list on read, so that list has to be
// exactly what the checkout sells. Too narrow and a combo silently vanishes
// from the drawer; too wide and a delisted pack sits in the cart until the
// server refuses it at the worst possible moment.
const orderable = fromCartGuard();
for (const slug of picker.keys()) {
  if (!orderable.has(slug)) {
    problems.push(`assets/js/cart.js: "${slug}" is in the checkout but ORDERABLE drops it from the cart`);
  }
}
for (const slug of orderable) {
  if (!picker.has(slug)) {
    problems.push(`assets/js/cart.js: ORDERABLE allows "${slug}", which the checkout does not sell`);
  }
}

// The box minimum is a number the customer is quoted before they commit. A
// page promising six while the server wants eight is a refusal after payment
// has been attempted, which is the one failure worth spending a check on.
const minimums = boxMinimums();
const wanted = minimums[0][1];
for (const [label, value] of minimums.slice(1)) {
  if (value !== wanted) {
    problems.push(`${label}: box minimum reads ${value}, but the server wants ${wanted}`);
  }
}

const delivery = deliveryQuotes();
for (const [label, rows] of [['free-delivery threshold', delivery.threshold], ['delivery charge', delivery.charge]]) {
  const wantedValue = rows[0][1];
  for (const [where, value] of rows.slice(1)) {
    if (value !== wantedValue) {
      problems.push(`${where}: ${label} reads ${value} paise, but the server uses ${wantedValue}`);
    }
  }
}

if (problems.length) {
  console.error('Prices disagree:\n  ' + problems.join('\n  '));
  process.exit(1);
}

console.log(`prices agree across all three sources (${server.size} slugs), plus the box minimum and delivery`);
