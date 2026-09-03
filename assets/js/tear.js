/* Protein पूरा — packs that tear open.
 *
 * Hovering a line-up card replaces the pack with the photograph of that same
 * pack torn open, its contents heaped in the mouth and thrown into the air.
 *
 * This used to be assembled in the browser: the pack clipped along a ragged
 * line, a heap built out of crumbs cut from the lifestyle shots, two dozen
 * pieces thrown on transitions. It was a reconstruction of a photograph, and
 * it looked like one. There is now a real photograph of each pack being
 * emptied, so the card shows that instead. The pieces, the tear and the light
 * on them are all as they came out of the camera.
 *
 * The photograph is a landscape crop of the top of a pack. Each one is
 * extended upwards in its own backdrop colour (see scripts/build-open-shots.py)
 * to the card's 0.73, so it fills the media box with nothing cropped away.
 *
 * Nothing is fetched until a card is first triggered, so a visitor who never
 * hovers never downloads a shot; once the card closes the image is taken back
 * out of the page, leaving the card exactly as it shipped.
 *
 * Triggering: hover where there is a real pointer; the first scroll into view
 * where there is not, since a phone has no hover and would otherwise never see
 * it. Under prefers-reduced-motion the swap still happens -- it is the point of
 * the card -- but it is a plain dissolve with no movement in it.
 */
(function () {
  'use strict';

  var media = Array.prototype.slice.call(document.querySelectorAll('[data-tear]'));
  if (!media.length) return;

  var OPEN_MS = 2400;      // how long the touch version stays open
  var SETTLE_MS = 700;     // the fade back, before the image is taken out again

  function build(box) {
    if (box.__open) return true;

    var slug = box.getAttribute('data-tear');
    var pack = box.querySelector('img');
    if (!slug || !pack) return false;

    var open = document.createElement('img');
    open.className = 'tear__open';
    open.src = '/assets/img/' + slug + '-open-720.webp';
    open.srcset = '/assets/img/' + slug + '-open-720.webp 720w, ' +
                  '/assets/img/' + slug + '-open-1080.webp 1080w';
    open.sizes = '(min-width: 1024px) 320px, (min-width: 600px) 300px, 62vw';
    open.width = 720;
    open.height = 985;
    open.alt = '';
    open.setAttribute('aria-hidden', 'true');   // the closed pack carries the alt
    open.decoding = 'async';

    box.__open = open;
    return true;
  }

  function open(box) {
    if (!build(box)) return;
    window.clearTimeout(box.__settle);

    if (!box.__open.parentNode) {
      box.appendChild(box.__open);
      // Resolve the closed state before asking for the open one, or the
      // browser goes straight to the end and nothing appears to happen.
      void box.__open.offsetWidth;
    }
    box.classList.add('is-torn');
  }

  function close(box) {
    if (!box.__open) return;
    box.classList.remove('is-torn');

    // Once it has faded, hand the card back its own markup.
    window.clearTimeout(box.__settle);
    box.__settle = window.setTimeout(function () {
      if (box.classList.contains('is-torn')) return;
      if (box.__open.parentNode) box.__open.remove();
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
