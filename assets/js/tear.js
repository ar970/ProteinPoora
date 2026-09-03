/* Protein पूरा — packs that tear open.
 *
 * Hovering a line-up card rips the top off the pouch and throws the snack out
 * of it. The pieces are real cut-outs from the product photography (see
 * scripts/extract-pieces.py), so each pack spills its own contents: strands
 * from the bhujia, chilli from the sweet chilli chakli, peanuts from the
 * peanuts.
 *
 * The pack is not two images. The card's existing <img> is cloned once, and
 * the two copies are clipped along the same ragged line — one keeps what is
 * above it, one what is below — so they fit together invisibly when closed and
 * separate when torn. Cloning costs no extra download; the browser already has
 * the bytes.
 *
 * Nothing is built until a card is first triggered, so a visitor who never
 * hovers never downloads a single piece. Once the pack has closed again the
 * split halves come back out of the page and the original <img> goes back in,
 * so a card at rest is exactly the card that shipped — no seam between the
 * halves, no compositing layer left behind to soften the text under it. The
 * built halves are kept aside rather than thrown away, so re-opening costs
 * nothing.
 *
 * Triggering: hover where there is a real pointer; the first scroll into view
 * where there is not, since a phone has no hover and would otherwise never see
 * it. Under prefers-reduced-motion nothing is built at all.
 */
(function () {
  'use strict';

  var media = Array.prototype.slice.call(document.querySelectorAll('[data-tear]'));
  if (!media.length) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var PIECES = 6;          // default; a card may declare fewer
  var OPEN_MS = 2000;      // how long the touch version stays open
  var SETTLE_MS = 900;     // longest piece transition plus its delay

  /* A tiny deterministic generator, so a given card scatters its pieces the
     same way on every visit rather than reshuffling on each hover. */
  function seeded(seed) {
    var n = seed;
    return function () {
      n = (n * 1103515245 + 12345) & 0x7fffffff;
      return n / 0x7fffffff;
    };
  }

  function hash(text) {
    var n = 0;
    for (var i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) & 0x7fffffff;
    return n || 1;
  }

  function build(box) {
    if (box.__stage) return true;

    var slug = box.getAttribute('data-tear');
    var count = parseInt(box.getAttribute('data-bits'), 10) || PIECES;
    var pack = box.querySelector('img');
    if (!slug || !pack) return false;

    var stage = document.createElement('div');
    stage.className = 'tear';

    // Behind everything: the dark inside of the pouch, revealed as the lid goes.
    var inside = document.createElement('span');
    inside.className = 'tear__inside';
    stage.appendChild(inside);

    // The pieces sit between the two halves of the pack, so they read as
    // coming out of the opening rather than floating in front of it.
    var bits = document.createElement('span');
    bits.className = 'tear__bits';
    var rand = seeded(hash(slug));

    for (var i = 0; i < count; i += 1) {
      var bit = document.createElement('span');
      bit.className = 'bit';

      // Fan out and up from the tear, wider and higher towards the middle of
      // the burst so it looks thrown rather than evenly placed.
      var t = (i + 0.5) / count;
      var spread = (t - 0.5) * 2;                    // -1 … 1
      var x = spread * (22 + rand() * 14);           // % of the card
      var y = -(7 + Math.cos(spread * 1.4) * 14 + rand() * 8);
      var rot = spread * 90 + (rand() * 60 - 30);
      var scale = 0.8 + rand() * 0.5;
      var delay = Math.round(rand() * 130);

      bit.style.setProperty('--x', x.toFixed(1) + '%');
      bit.style.setProperty('--y', y.toFixed(1) + '%');
      bit.style.setProperty('--r', rot.toFixed(0) + 'deg');
      bit.style.setProperty('--s', scale.toFixed(2));
      bit.style.setProperty('--d', delay + 'ms');

      var img = document.createElement('img');
      img.src = '/assets/img/bits/' + slug + '-' + (i + 1) + '.webp';
      img.alt = '';
      img.decoding = 'async';
      // Belt and braces: if a file is ever missing, its piece removes itself
      // rather than leaving a broken image in the burst.
      img.addEventListener('error', function () {
        if (this.parentNode) this.parentNode.remove();
      });
      bit.appendChild(img);
      bits.appendChild(bit);
    }
    stage.appendChild(bits);   // the halves are inserted ahead of this

    // The pack, split along one ragged line. Two clones of the same <img>:
    // the browser already holds the bytes, so this costs no download.
    var body = pack.cloneNode(false);
    body.className = 'tear__body';
    body.removeAttribute('loading');

    var lid = pack.cloneNode(false);
    lid.className = 'tear__lid';
    lid.removeAttribute('loading');
    lid.alt = '';
    lid.setAttribute('aria-hidden', 'true');

    // Back to front: the inside of the pouch, the bottom of the pack, the lid
    // peeling off it, and the pieces bursting past all of it.
    stage.insertBefore(body, bits);
    stage.insertBefore(lid, bits);

    box.__pack = pack;
    box.__stage = stage;
    return true;
  }

  function open(box) {
    if (!build(box)) return;
    window.clearTimeout(box.__settle);

    if (!box.__stage.parentNode) {
      box.__pack.replaceWith(box.__stage);
      // Resolve the closed state before asking for the open one, or the
      // browser jumps straight to the end and the pack never appears to tear.
      void box.__stage.offsetWidth;
    }
    box.classList.add('is-torn');
  }

  function close(box) {
    if (!box.__stage) return;
    box.classList.remove('is-torn');

    // Once everything has settled, hand the card back its own photograph.
    window.clearTimeout(box.__settle);
    box.__settle = window.setTimeout(function () {
      if (box.classList.contains('is-torn')) return;
      if (box.__stage.parentNode) box.__stage.replaceWith(box.__pack);
    }, SETTLE_MS);
  }

  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (canHover) {
    media.forEach(function (box) {
      var card = box.closest('.product-card') || box;
      card.addEventListener('mouseenter', function () { open(box); });
      card.addEventListener('mouseleave', function () { close(box); });
      // Keyboard users reach the card through its title link.
      card.addEventListener('focusin', function () { open(box); });
      card.addEventListener('focusout', function () { close(box); });
    });
    return;
  }

  // No hover: tear each pack open once, the first time it is scrolled to.
  if (!('IntersectionObserver' in window)) return;

  var seen = new WeakSet();
  var watcher = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting || seen.has(entry.target)) return;
      seen.add(entry.target);
      watcher.unobserve(entry.target);

      var box = entry.target;
      open(box);
      window.setTimeout(function () { close(box); }, OPEN_MS);
    });
  }, { threshold: 0.55 });

  media.forEach(function (box) { watcher.observe(box); });
})();
