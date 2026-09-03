/* Protein पूरा — packs that tear open.
 *
 * Hovering a line-up card rips the top off the pouch and throws the snack out
 * of it. The pieces are cut straight out of the photographs of the packs being
 * emptied (see scripts/extract-pieces.py) -- whole strands of bhujia, whole
 * sticks of chakli, whole peanuts, each one airborne and sharp in the frame it
 * came from -- so what leaves a pack is the pack's own contents, photographed.
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

  var CUTOUTS = 6;         // distinct pieces a pack has, unless it says otherwise
  var OPEN_MS = 2000;      // how long the touch version stays open
  var SETTLE_MS = 1000;    // longest piece transition plus its delay

  /* A phone stacks the cards one above the next with very little between
     them, and its pack is the width of the screen. The same throw that reads
     as generous on a desktop grid lands all over the card above and pushes the
     page sideways, so the burst is smaller, tighter and shorter there. Read
     when a card is first built rather than at load, so turning the phone
     before you reach the line-up is respected. */
  function measure() {
    var narrow = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    return narrow
      ? { burst: 14, mound: 12, lift: 0.45, fling: 0.6, size: 0.82 }
      : { burst: 26, mound: 16, lift: 1, fling: 1, size: 1 };
  }

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
    var cutouts = parseInt(box.getAttribute('data-bits'), 10) || CUTOUTS;
    var pack = box.querySelector('img');
    if (!slug || !pack) return false;

    var room = measure();

    var stage = document.createElement('div');
    stage.className = 'tear';

    // Behind everything: the dark inside of the pouch, revealed as the lid goes.
    var inside = document.createElement('span');
    inside.className = 'tear__inside';
    stage.appendChild(inside);

    var rand = seeded(hash(slug));
    var file = 0;

    function piece(x, y, rot, scale, delay, flip) {
      var bit = document.createElement('span');
      bit.className = 'bit';
      bit.style.setProperty('--x', x.toFixed(1) + '%');
      bit.style.setProperty('--y', y.toFixed(1) + '%');
      bit.style.setProperty('--r', rot.toFixed(0) + 'deg');
      // The cut-outs are exported at twice the size a strand takes up on the
      // pack, so scaling near 1 draws them at the size they are in the
      // photograph's own tight crop -- which is where that picture gets its
      // punch -- while still never enlarging the file.
      bit.style.setProperty('--s', scale.toFixed(2));
      bit.style.setProperty('--f', flip ? '-1' : '1');
      bit.style.setProperty('--d', delay + 'ms');

      var img = document.createElement('img');
      // More pieces are used than there are cut-outs, so the same strand comes
      // back turned over and at another angle -- which is what a photograph of
      // a pack being emptied actually looks like. The browser downloads each
      // file once however many times it appears.
      file += 1;
      img.src = '/assets/img/bits/' + slug + '-' + (file % cutouts + 1) + '.webp';
      img.alt = '';
      img.decoding = 'async';
      // Belt and braces: if a file is ever missing, its piece removes itself
      // rather than leaving a broken image in the burst.
      img.addEventListener('error', function () {
        if (this.parentNode) this.parentNode.remove();
      });
      bit.appendChild(img);
      return bit;
    }

    /* The heap in the mouth of the pouch. It goes behind the front of the
       pack, so the pack's own torn edge cuts across it and only what stands
       proud of the tear shows -- the pack reads as full rather than as having
       a hole cut in it. */
    var heap = document.createElement('span');
    heap.className = 'tear__bits tear__bits--heap';
    for (var m = 0; m < room.mound; m += 1) {
      var mt = (m + 0.5) / room.mound;
      var mx = (mt - 0.5) * 2 * (19 + rand() * 9);
      // Highest through the middle of the heap, as a poured pile is.
      var my = -(Math.cos((mt - 0.5) * 3.1) * 4.5 + rand() * 2.5);
      heap.appendChild(piece(mx, my, rand() * 200 - 100,
                             (0.82 + rand() * 0.24) * room.size,
                             Math.round(rand() * 90), m % 2));
    }
    stage.appendChild(heap);

    // ... and the pieces thrown clear of it, in front of the pack.
    var bits = document.createElement('span');
    bits.className = 'tear__bits';
    for (var i = 0; i < room.burst; i += 1) {
      // Fan up and out from the tear, highest through the middle and thrown
      // wide at the edges, with every other one left tumbling near the mouth
      // so the pack reads as spilling rather than as firing.
      var t = (i + 0.5) / room.burst;
      var spread = (t - 0.5) * 2;                    // -1 … 1
      var reach = i % 2 ? 0.4 : 1;
      var x = spread * (17 + rand() * 13) * reach * room.fling;   // % of the card
      var y = -(6 + Math.cos(spread * 1.5) * 18 + rand() * 8) * reach * room.lift;
      bits.appendChild(piece(x, y, spread * 120 + (rand() * 90 - 45),
                             (0.68 + rand() * 0.34) * room.size,
                             Math.round(rand() * 220), i % 2));
    }
    stage.appendChild(bits);   // the halves are inserted ahead of this

    // The pack, split along one ragged line. Three clones of the same <img>:
    // the browser already holds the bytes, so this costs no download.
    var body = pack.cloneNode(false);
    body.className = 'tear__body';
    body.removeAttribute('loading');

    // The pale fibre along the tear -- the same photograph, brightened, cut to
    // a ribbon straddling the line.
    var edge = pack.cloneNode(false);
    edge.className = 'tear__edge';
    edge.removeAttribute('loading');
    edge.alt = '';
    edge.setAttribute('aria-hidden', 'true');

    var lid = pack.cloneNode(false);
    lid.className = 'tear__lid';
    lid.removeAttribute('loading');
    lid.alt = '';
    lid.setAttribute('aria-hidden', 'true');

    // Back to front: the inside of the pouch, the heap in its mouth, the front
    // of the pack, the torn fibre across it, the lid peeling off, and the
    // pieces bursting past all of it.
    stage.insertBefore(body, bits);
    stage.insertBefore(edge, bits);
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
