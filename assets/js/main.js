/* Protein पूरा — theme script.
   Only progressive enhancement lives here. Pages work without it. */
(function () {
  'use strict';

  /* --- Mobile menu ------------------------------------------------------ */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');

  if (toggle && nav) {
    var label = toggle.querySelector('.menu-toggle__label');

    var isOpen = function () {
      return toggle.getAttribute('aria-expanded') === 'true';
    };

    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
      if (label) label.textContent = open ? 'Close menu' : 'Open menu';
    };

    toggle.addEventListener('click', function () {
      setOpen(!isOpen());
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (!isOpen()) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });
  }

  /* --- Product gallery + lightbox --------------------------------------- */
  var gallery = document.querySelector('[data-gallery]');

  if (gallery) {
    var main = gallery.querySelector('.gallery__main');
    var zoom = gallery.querySelector('.gallery__zoom');
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('.thumb'));
    var dialog = document.getElementById('lightbox');
    var lightboxImg = dialog ? dialog.querySelector('.lightbox__img') : null;
    var canDialog = dialog && typeof dialog.showModal === 'function';
    var index = 0;

    var show = function (i) {
      if (!thumbs.length) return;
      index = (i + thumbs.length) % thumbs.length;
      var t = thumbs[index];
      main.src = t.getAttribute('data-src');
      main.srcset = t.getAttribute('data-srcset') || '';
      main.alt = t.getAttribute('data-alt') || '';
      main.setAttribute('data-kind', t.getAttribute('data-kind') || 'photo');
      thumbs.forEach(function (b, k) {
        b.setAttribute('aria-current', k === index ? 'true' : 'false');
      });
      if (canDialog && dialog.open) {
        lightboxImg.src = t.getAttribute('data-large');
        lightboxImg.alt = t.getAttribute('data-alt') || '';
      }
    };

    thumbs.forEach(function (b, k) {
      b.addEventListener('click', function () { show(k); });
    });

    gallery.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') show(index + 1);
      if (event.key === 'ArrowLeft') show(index - 1);
    });

    if (zoom && canDialog) {
      zoom.addEventListener('click', function () {
        var t = thumbs[index];
        lightboxImg.src = t.getAttribute('data-large');
        lightboxImg.alt = t.getAttribute('data-alt') || '';
        dialog.showModal();
      });

      dialog.querySelector('[data-prev]').addEventListener('click', function () { show(index - 1); });
      dialog.querySelector('[data-next]').addEventListener('click', function () { show(index + 1); });
      dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.close(); });

      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });

      dialog.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowRight') show(index + 1);
        if (event.key === 'ArrowLeft') show(index - 1);
      });
    } else if (zoom) {
      zoom.setAttribute('disabled', '');
    }
  }

  /* --- Hero showcase: coverflow carousel ---------------------------------
     Reads its products from the DOM, so porting to a Liquid section means
     emitting the slides from section blocks and changing nothing here. */
  var showcase = document.querySelector('[data-showcase]');

  if (showcase) {
    /* Cadence lives in CSS: the dot-fill animation is the clock. */
    var FLIP = 250;

    var stage = showcase.querySelector('[data-showcase-stage]');
    var nameEl = showcase.querySelector('[data-showcase-name]');
    var badge = showcase.querySelector('[data-showcase-badge]');
    var badgeNum = showcase.querySelector('[data-showcase-badge-num]');
    var dotList = showcase.querySelector('[data-showcase-dots]');
    var link = document.querySelector('[data-showcase-link]');
    var slides = Array.prototype.slice.call(showcase.querySelectorAll('.showcase__slide'));
    var frame = showcase.closest('.hero-frame') || showcase;

    var products = slides.map(function (slide) {
      return {
        name: slide.dataset.name,
        accent: slide.dataset.accent,
        protein: slide.dataset.protein,
        url: slide.dataset.url
      };
    });

    var count = products.length;
    var current = 0;
    var timers = [];

    var clearTimers = function () {
      timers.forEach(clearTimeout);
      timers = [];
    };

    var after = function (ms, fn) {
      timers.push(setTimeout(fn, ms));
    };

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* Build the dots from the slides so the count always matches. */
    products.forEach(function (product, i) {
      var li = document.createElement('li');
      li.className = 'dot-wrap';
      var button = document.createElement('button');
      button.className = 'dot';
      button.type = 'button';
      button.setAttribute('aria-label', 'Show ' + product.name);
      button.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      button.appendChild(document.createElement('span')).className = 'dot__fill';
      li.appendChild(button);
      dotList.appendChild(li);
    });

    var dots = Array.prototype.slice.call(dotList.querySelectorAll('.dot'));

    /* Position every slide relative to the active one, wrapping both ways,
       so one advance shifts the whole row a single slot left. */
    var layout = function () {
      slides.forEach(function (slide, i) {
        var rel = i - current;
        if (rel > count / 2) rel -= count;
        if (rel < -count / 2) rel += count;
        slide.dataset.rel = String(rel);
      });
    };

    var restartFill = function (index) {
      var fill = dots[index].querySelector('.dot__fill');
      fill.style.animation = 'none';
      void fill.offsetWidth;
      fill.style.animation = '';
    };

    var paint = function (product) {
      frame.style.setProperty('--accent', product.accent);
      /* Point the protein-numbers button at whichever product is showing. */
      if (link && product.url) {
        link.setAttribute('href', product.url);
        link.setAttribute('aria-label', 'See the protein numbers for ' + product.name);
      }
    };

    var show = function (index) {
      var next = ((index % count) + count) % count;
      if (next === current) return;

      clearTimers();
      current = next;
      var product = products[current];

      layout();
      paint(product);

      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === current ? 'true' : 'false');
      });

      if (reduced.matches) {
        nameEl.textContent = product.name;
        badgeNum.textContent = product.protein;
        badge.style.setProperty('--badge-accent', product.accent);
        return;
      }

      /* Name: blur out to the left, in from the right. */
      nameEl.classList.add('is-out');
      after(150, function () {
        nameEl.textContent = product.name;
        nameEl.classList.remove('is-out');
        nameEl.classList.add('is-enter');
        requestAnimationFrame(function () {
          nameEl.classList.remove('is-enter');
        });
      });

      /* Badge: flip edge-on, swap at the halfway point, flip back. */
      badge.classList.add('is-flipping');
      after(FLIP, function () {
        badgeNum.textContent = product.protein;
        badge.style.setProperty('--badge-accent', product.accent);
        badge.classList.remove('is-flipping');
      });

      restartFill(current);
    };

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        if (i === current) {
          restartFill(current);
          return;
        }
        show(i);
      });

      /* The fill animation is the clock: when it ends, advance. Pausing the
         animation therefore pauses advancement, with no separate timer. */
      dot.querySelector('.dot__fill').addEventListener('animationend', function () {
        if (i === current) show(current + 1);
      });
    });

    var pause = function () { showcase.classList.add('is-paused'); };
    var resume = function () { showcase.classList.remove('is-paused'); };

    stage.addEventListener('mouseenter', pause);
    stage.addEventListener('mouseleave', resume);
    showcase.addEventListener('focusin', pause);
    showcase.addEventListener('focusout', resume);

    /* Swipe to change products. */
    var startX = null;
    var startY = null;

    stage.addEventListener('pointerdown', function (event) {
      startX = event.clientX;
      startY = event.clientY;
    });

    stage.addEventListener('pointerup', function (event) {
      if (startX === null) return;
      var dx = event.clientX - startX;
      var dy = event.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        show(current + (dx < 0 ? 1 : -1));
      }
    });

    stage.addEventListener('pointercancel', function () { startX = null; });

    var applyMotionPreference = function () {
      clearTimers();
      if (reduced.matches) {
        current = 0;
        layout();
        dots.forEach(function (dot, i) {
          dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
        });
        nameEl.textContent = products[0].name;
        badgeNum.textContent = products[0].protein;
        badge.style.setProperty('--badge-accent', products[0].accent);
        paint(products[0]);
      } else {
        restartFill(current);
      }
    };

    layout();
    paint(products[0]);
    badge.style.setProperty('--badge-accent', products[0].accent);
    nameEl.textContent = products[0].name;
    badgeNum.textContent = products[0].protein;

    if (reduced.addEventListener) {
      reduced.addEventListener('change', applyMotionPreference);
    }
    applyMotionPreference();
  }

  /* --- Reveal the line-up cards on scroll -------------------------------- */
  var revealGrid = document.querySelector('[data-reveal-grid]');

  if (revealGrid) {
    var wantsMotion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (wantsMotion && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px' });
      observer.observe(revealGrid);
    } else {
      /* No observer, or motion is not wanted: show the cards outright. */
      revealGrid.classList.add('is-in');
    }
  }

  /* --- Quantity stepper -------------------------------------------------- */
  var qty = document.querySelector('[data-qty]');

  if (qty) {
    var input = qty.querySelector('.qty__input');

    var step = function (delta) {
      var min = parseInt(input.min, 10) || 1;
      var max = parseInt(input.max, 10) || 99;
      var next = (parseInt(input.value, 10) || min) + delta;
      input.value = Math.min(max, Math.max(min, next));
    };

    qty.querySelector('[data-qty-down]').addEventListener('click', function () { step(-1); });
    qty.querySelector('[data-qty-up]').addEventListener('click', function () { step(1); });
  }

  /* --- Pre-order button (placeholder until Shopify is connected) -------- */
  var cartButton = document.querySelector('[data-add-to-cart]');
  var cartStatus = document.querySelector('.buy__status');

  if (cartButton && cartStatus) {
    cartButton.addEventListener('click', function () {
      cartStatus.textContent = 'Checkout isn’t connected yet. Pre-orders open with the Shopify store.';
    });
  }
})();
