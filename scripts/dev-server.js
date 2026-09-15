'use strict';

/**
 * Local development server.
 *
 * Vercel serves the static files and routes /api/* to the handlers in api/.
 * This reproduces that locally so the site can be run end to end without a
 * deploy, including `cleanUrls` and the trailing-slash behaviour from
 * vercel.json. It loads the real handler modules — nothing here is a stub.
 *
 *   node scripts/dev-server.js
 *
 * Reads .env for RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, the way Vercel reads
 * the project's environment variables in production. .env is gitignored.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * A very small .env reader: KEY=VALUE a line, # comments, optional quotes.
 * Not dotenv -- this is the only place that needs it, and a dependency whose
 * whole job is splitting on "=" is not worth shipping to production.
 * Anything already in the real environment wins.
 */
(function loadEnv() {
  let raw;
  try {
    raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim().replace(/\s+#.*$/, '');
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const ROUTES = {
  '/api/products': path.join(ROOT, 'api', 'products.js'),
  '/api/preorders': path.join(ROOT, 'api', 'preorders.js'),
  '/api/create-order': path.join(ROOT, 'api', 'create-order.js'),
  '/api/verify-payment': path.join(ROOT, 'api', 'verify-payment.js')
};

/** Mirrors Vercel's static resolution: exact file, then .html, then index.html. */
function resolveStatic(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel.includes('..')) return null;

  const candidates = [
    path.join(ROOT, rel),
    path.join(ROOT, `${rel}.html`),
    path.join(ROOT, rel, 'index.html')
  ];
  for (const file of candidates) {
    if (!file.startsWith(ROOT)) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  const route = ROUTES[pathname.replace(/\/$/, '')];
  if (route) {
    try {
      const handler = require(route);
      await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Handler crashed.' }));
      }
    }
    return;
  }

  const file = resolveStatic(pathname === '/' ? 'index.html' : pathname);
  if (!file) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Protein पूरा dev server → http://127.0.0.1:${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.log('  ! DATABASE_URL is not set — /api/products and /api/preorders return 503.');
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.log('  ! RAZORPAY_KEY_ID/SECRET are not set — checkout returns 503 and no order can be placed.');
  } else {
    const mode = /^rzp_live_/.test(process.env.RAZORPAY_KEY_ID) ? 'LIVE — real money' : 'test mode';
    console.log(`  · Razorpay ${process.env.RAZORPAY_KEY_ID.slice(0, 12)}… (${mode})`);
  }
});
