'use strict';

/**
 * Each asset must carry the same ?v= on every page that references it.
 *
 * `/assets/(css|js)/` is served `immutable` for a year, which is right --
 * the ?v= in the URL is what busts it, so a changed asset is a changed URL.
 * The failure mode that buys is a *partial* bump: one page updated, another
 * left behind, and a browser holding last week's stylesheet against this
 * week's markup for as long as it likes. That is invisible in testing,
 * because a fresh browser has neither cached.
 *
 * Assets do not share a version -- fonts.css sits on its own number because
 * the fonts almost never change -- so the rule is per file, not global.
 *
 *   node scripts/check-assets.js     (also: npm run check:assets)
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
})(root);

const seen = new Map();   // asset -> Map(version -> [pages])
let total = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8');
  const re = /\/assets\/(?:css|js)\/([A-Za-z0-9._-]+)\?v=(\d+)/g;
  let m;
  while ((m = re.exec(html))) {
    const [, asset, version] = m;
    if (!seen.has(asset)) seen.set(asset, new Map());
    const byVersion = seen.get(asset);
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(path.relative(root, page));
    total += 1;
  }
}

if (!seen.size) {
  console.error('No versioned css/js references found at all — that is itself wrong.');
  process.exit(1);
}

const split = [...seen].filter(([, byVersion]) => byVersion.size > 1);
if (split.length) {
  console.error('An asset is referenced at two versions. One of those pages will hold a');
  console.error('stale copy for a year, because /assets/(css|js)/ is served immutable:\n');
  for (const [asset, byVersion] of split) {
    console.error(`  ${asset}`);
    for (const [version, where] of byVersion) {
      console.error(`      ?v=${version}  ${where.join(', ')}`);
    }
  }
  process.exit(1);
}

console.log(`assets consistent: ${seen.size} files, ${total} references across ${pages.length} pages`);
for (const [asset, byVersion] of [...seen].sort()) {
  console.log(`  ${asset.padEnd(18)} ?v=${[...byVersion.keys()][0]}`);
}
