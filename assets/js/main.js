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

  /* --- Hero showcase carousel -------------------------------------------- */
  var showcase = document.querySelector('[data-showcase]');

  if (showcase) {
    var PRODUCTS = [
      { name: 'Masala Bhujia', accent: '#E8862E', protein: '14g' },
      { name: 'Sweet Chilli Chakli', accent: '#D94F2B', protein: '9g' },
      { name: 'Pudina Bhujia', accent: '#E0A82E', protein: '14g' },
      { name: 'Cheddar Cheese Chakli', accent: '#2E8B6F', protein: '9g' },
      { name: 'Korean BBQ Peanuts', accent: '#C4462F', protein: '18g' }
    ];

    var stage = showcase.querySelector('[data-showcase-stage]');
    var nameEl = showcase.querySelector('[data-showcase-name]');
    var glow = showcase.querySelector('[data-showcase-glow]');
    var badge = showcase.querySelector('[data-showcase-badge]');
    var badgeNum = showcase.querySelector('[data-showcase-badge-num]');
    var packs = Array.prototype.slice.call(showcase.querySelectorAll('.showcase__pack'));
    var dots = Array.prototype.slice.call(showcase.querySelectorAll('.dot'));
    var hero = showcase.closest('.hero') || showcase;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var current = 0;
    var timers = [];

    var clearTimers = function () {
      timers.forEach(clearTimeout);
      timers = [];
    };

    var after = function (ms, fn) {
      timers.push(setTimeout(fn, ms));
    };

    // "#E8862E" -> "rgba(232, 134, 46, 0.14)"
    var glowColor = function (hex) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', 0.14)';
    };

    var paintAccent = function (product) {
      showcase.style.setProperty('--accent', product.accent);
      glow.style.setProperty('--glow', glowColor(product.accent));
    };

    // Restart the dot's fill animation, which also drives auto-advance.
    var restartFill = function (index) {
      var fill = dots[index].querySelector('.dot__fill');
      fill.style.animation = 'none';
      void fill.offsetWidth;
      fill.style.animation = '';
    };

    var show = function (index) {
      if (index === current) return;
      clearTimers();

      var previous = current;
      current = (index + PRODUCTS.length) % PRODUCTS.length;
      var product = PRODUCTS[current];

      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === current ? 'true' : 'false');
      });

      if (reduced.matches) {
        packs.forEach(function (pack, i) {
          pack.classList.toggle('is-active', i === current);
          pack.classList.remove('is-leaving');
        });
        nameEl.textContent = product.name;
        badgeNum.textContent = product.protein;
        paintAccent(product);
        return;
      }

      // Packs cross-fade: outgoing left, incoming from the right.
      packs[previous].classList.remove('is-active');
      packs[previous].classList.add('is-leaving');
      packs[current].classList.remove('is-leaving');
      packs[current].classList.add('is-active');
      after(700, function () {
        packs[previous].classList.remove('is-leaving');
      });

      // Glow cross-fades on its own 900ms transition.
      paintAccent(product);

      // Name lands 150ms after the pack starts moving.
      nameEl.classList.add('is-out');
      after(150, function () {
        nameEl.textContent = product.name;
        nameEl.classList.remove('is-out');
        nameEl.classList.add('is-enter');
        requestAnimationFrame(function () {
          nameEl.classList.remove('is-enter');
        });
      });

      // Badge collapses, swaps, springs back.
      badge.classList.add('is-swapping');
      after(280, function () {
        badgeNum.textContent = product.protein;
        badge.classList.remove('is-swapping');
      });

      restartFill(current);
    };

    // The dot fill is the clock: when it finishes, advance.
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        show(i);
        if (i === current) restartFill(current);
      });
      dot.querySelector('.dot__fill').addEventListener('animationend', function () {
        if (i === current) show(current + 1);
      });
    });

    var pause = function () { showcase.classList.add('is-paused'); };
    var resume = function () { showcase.classList.remove('is-paused'); };

    hero.addEventListener('mouseenter', pause);
    hero.addEventListener('mouseleave', resume);
    showcase.addEventListener('focusin', pause);
    showcase.addEventListener('focusout', resume);

    // Swipe to change products.
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

    paintAccent(PRODUCTS[0]);

    // If the user turns reduced motion on or off, reset to a sane state.
    var applyMotionPreference = function () {
      clearTimers();
      if (reduced.matches) {
        current = 0;
        packs.forEach(function (pack, i) {
          pack.classList.toggle('is-active', i === 0);
          pack.classList.remove('is-leaving');
        });
        dots.forEach(function (dot, i) {
          dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
        });
        nameEl.textContent = PRODUCTS[0].name;
        badgeNum.textContent = PRODUCTS[0].protein;
        paintAccent(PRODUCTS[0]);
      } else {
        restartFill(current);
      }
    };

    if (reduced.addEventListener) {
      reduced.addEventListener('change', applyMotionPreference);
    }
    applyMotionPreference();
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
