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

    /* Only the active pouch is on screen on a phone; on a wider screen its two
       neighbours show behind it. Everything else used to load anyway -- five
       pack shots, about 1.4 MB, most of it for pouches nobody could see. The
       markup hands those over as data-src and they are fetched when they come
       within reach of being looked at. */
    var narrow = window.matchMedia('(max-width: 767px)');
    var reach = 0;

    var hydrate = function (slide) {
      var img = slide.querySelector('img[data-src]');
      if (!img) return;
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      delete img.dataset.src;
      delete img.dataset.srcset;
    };

    /* Position every slide relative to the active one, wrapping both ways,
       so one advance shifts the whole row a single slot left. */
    var layout = function () {
      slides.forEach(function (slide, i) {
        var rel = i - current;
        if (rel > count / 2) rel -= count;
        if (rel < -count / 2) rel += count;
        slide.dataset.rel = String(rel);
        if (Math.abs(rel) <= (narrow.matches ? 0 : 1) + reach) hydrate(slide);
      });
    };

    /* Once the page is quiet, widen that reach by one so a swipe or an advance
       never waits on a download. The carousel advances on a timer, so this is
       a prefetch either way, not an optimisation nobody asked for. */
    var warm = function () {
      reach = 1;
      layout();
    };
    if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 4000 });
    else setTimeout(warm, 2500);

    /* Rotating a phone can reveal the neighbours that were never fetched. */
    if (narrow.addEventListener) narrow.addEventListener('change', layout);

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

  /* Adding to the cart is handled by assets/js/cart.js, which delegates from
   * the document so it covers the combo cards and the drawer alike. They are
   * links to /preorder, so they still do something sensible with JavaScript
   * off. The box builder below is the exception: a running total cannot be
   * built without script, so it says so in a <noscript> and sends people to
   * the checkout, whose picker can build the same box. */

  /* --- Nutrition, from the line-up ---------------------------------------
     The card's button opens the table for that pack without leaving the page.
     The numbers are the product pages' own, lifted into #nutrition-data at
     build time by hand rather than typed twice; the dialog just renders them.

     Without <dialog> support, or with the data missing, the button is left as
     a plain link-through to the product page, which has the same table. */
  (function () {
    var dialog = document.getElementById('nutrition-dialog');
    var source = document.getElementById('nutrition-data');
    var buttons = document.querySelectorAll('[data-nutrition]');
    if (!buttons.length) return;

    var data = null;
    try {
      data = source ? JSON.parse(source.textContent) : null;
    } catch (err) {
      data = null;
    }

    var canDialog = dialog && typeof dialog.showModal === 'function';
    if (!canDialog || !data) {
      Array.prototype.forEach.call(buttons, function (button) {
        var slug = button.getAttribute('data-nutrition');
        var link = document.createElement('a');
        link.className = button.className;
        link.href = '/products/' + slug + '#nutrition';
        link.innerHTML = button.innerHTML;
        // Keep the hook, so the element is still findable as the same thing.
        link.setAttribute('data-nutrition', slug);
        button.parentNode.replaceChild(link, button);
      });
      return;
    }

    var title = dialog.querySelector('#nutri-title');
    var sub = dialog.querySelector('[data-nutri-sub]');
    var body = dialog.querySelector('[data-nutri-body]');
    var foot = dialog.querySelector('[data-nutri-foot]');
    var link = dialog.querySelector('[data-nutri-link]');
    var opener = null;

    function cell(tag, text, scope) {
      var node = document.createElement(tag);
      node.textContent = text;
      if (scope) node.setAttribute('scope', scope);
      return node;
    }

    function render(slug) {
      var info = data[slug];
      if (!info) return false;

      title.textContent = info.name;
      sub.textContent = info.sub;
      foot.textContent = info.foot;
      link.href = '/products/' + slug + '#nutrition';

      var table = document.createElement('table');

      // The dialog's own heading already names the pack, so the table's
      // caption would say it a second time. It stays for screen readers,
      // where a table out of context still needs naming.
      var caption = cell('caption', 'Nutritional information for ' + info.name);
      caption.className = 'visually-hidden';
      table.appendChild(caption);

      var thead = document.createElement('thead');
      var hrow = document.createElement('tr');
      ['Nutrient', info.per, '% RDA per serve'].forEach(function (label) {
        hrow.appendChild(cell('th', label, 'col'));
      });
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      info.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        if (row.kind) tr.className = row.kind;
        tr.appendChild(cell('th', row.name, 'row'));
        tr.appendChild(cell('td', row.amount));
        tr.appendChild(cell('td', row.rda));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      body.textContent = '';
      body.appendChild(table);
      return true;
    }

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        if (!render(button.getAttribute('data-nutrition'))) {
          window.location.href = '/products/' + button.getAttribute('data-nutrition') + '#nutrition';
          return;
        }
        opener = button;
        dialog.showModal();
        // The table scrolls; start it at the top rather than wherever the
        // last pack left it.
        body.scrollTop = 0;
      });
    });

    dialog.querySelector('[data-nutri-close]').addEventListener('click', function () {
      dialog.close();
    });

    // Clicking the backdrop closes it. The dialog itself is the click target
    // only when the pointer is outside the panel.
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('close', function () {
      if (opener && opener.focus) opener.focus();
      opener = null;
    });
  })();

  /* --- Build your own box ------------------------------------------------
     Each card shows one control at a time: Add until there is something in the
     box, then a stepper. The swap is itself the confirmation that the tap
     landed, which is why there is no toast. */
  (function () {
    var grid = document.querySelector('[data-box]');
    if (!grid) return;

    var countEl = document.querySelector('[data-box-count]');
    var totalEl = document.querySelector('[data-box-total]');
    var addBtn = document.querySelector('[data-box-add]');
    var progress = document.querySelector('[data-box-progress]');
    var pips = progress ? Array.prototype.slice.call(progress.children) : [];
    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-box-pack]'));

    /* The markup states the minimum, the same value the section's own copy
       quotes. check:prices fails if it drifts from the server's. */
    var MIN = parseInt(grid.getAttribute('data-box-min'), 10) || 6;
    var MAX_PER_PACK = 20;

    var crate = document.querySelector('[data-box-crate]');
    var wasComplete = false;

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var canFly = typeof Element.prototype.animate === 'function';

    /* A pack going into the box, literally. A clone of the pack shot is flown
       from the card to the crate in the bar — a clone, so nothing in the card
       moves, reflows, or is left behind if the animation is interrupted.
       Fixed positioning means it does not care what is scrolled or clipped
       between the two.

       Three keyframes rather than two: a straight line between a card and a
       bar below it reads as a slide, and the arc is what makes it read as
       something being dropped in. */
    function flyToCrate(card) {
      if (!crate || !canFly || reducedMotion.matches) return;

      var pack = card.querySelector('.box-card__media img');
      if (!pack) return;

      var from = pack.getBoundingClientRect();
      var to = crate.getBoundingClientRect();
      if (!from.width || !to.width) return;

      // The bar is sticky, so the crate is normally on screen — but not at
      // every scroll position. Flying a pack to a point nobody can see reads
      // as the pack leaving the page, so when the crate is out of view the
      // add just happens, with the count and the pips to show for it.
      if (to.bottom < 0 || to.top > window.innerHeight) return;

      var flyer = pack.cloneNode(true);
      flyer.className = 'pack-fly';
      flyer.removeAttribute('loading');
      flyer.style.left = from.left + 'px';
      flyer.style.top = from.top + 'px';
      flyer.style.width = from.width + 'px';
      flyer.style.height = from.height + 'px';
      document.body.appendChild(flyer);

      var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      // Enough lift to be an arc, but capped so a long flight on a tall page
      // does not sail off the top of the screen.
      var lift = Math.min(110, Math.max(40, Math.abs(dy) * 0.32));

      var run = flyer.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(' + (dx * 0.5) + 'px, ' + (dy * 0.5 - lift) + 'px) scale(0.62)',
          opacity: 1, offset: 0.5 },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.16)', opacity: 0.25 }
      ], { duration: 620, easing: 'cubic-bezier(.34,.05,.28,1)', fill: 'forwards' });

      var land = function () {
        flyer.remove();
        crate.classList.add('is-catching');
        window.setTimeout(function () { crate.classList.remove('is-catching'); }, 220);
      };
      if (run.finished && typeof run.finished.then === 'function') {
        run.finished.then(land, land);
      } else {
        run.onfinish = land;
      }
    }

    function rupees(paise) {
      var value = paise / 100;
      return '₹' + value.toLocaleString('en-IN', {
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
      });
    }

    function inputOf(card) { return card.querySelector('.qty__input'); }
    function qtyOf(card) { return parseInt(inputOf(card).value, 10) || 0; }

    function setQty(card, next) {
      var qty = Math.max(0, Math.min(MAX_PER_PACK, Math.floor(Number(next) || 0)));
      inputOf(card).value = String(qty);
      paint();
      return qty;
    }

    /* A brief nudge on the pack shot, restarted from zero each time so a
       rapid tap-tap-tap is felt rather than swallowed by a running animation. */
    function nudge(card) {
      card.classList.remove('is-adding');
      void card.offsetWidth;
      card.classList.add('is-adding');
      window.setTimeout(function () { card.classList.remove('is-adding'); }, 220);
    }

    function paint() {
      var packs = 0;
      var total = 0;

      cards.forEach(function (card) {
        var qty = qtyOf(card);
        packs += qty;
        total += qty * (parseInt(card.getAttribute('data-price-paise'), 10) || 0);
        card.classList.toggle('is-chosen', qty > 0);
        // One control at a time: Add until there is a quantity to step.
        card.querySelector('[data-box-add-one]').hidden = qty > 0;
        card.querySelector('[data-box-qty]').hidden = qty === 0;
      });

      pips.forEach(function (pip, i) {
        pip.classList.toggle('is-filled', i < packs);
      });
      var complete = packs >= MIN;
      if (progress) progress.classList.toggle('is-complete', complete);
      if (crate) crate.classList.toggle('is-full', complete);

      var short = MIN - packs;
      if (packs === 0) {
        countEl.textContent = 'Pick ' + MIN + ' packs to start a box.';
      } else if (short > 0) {
        countEl.textContent = packs + (packs === 1 ? ' pack' : ' packs') + ' — ' +
          short + ' more to go.';
      } else {
        countEl.textContent = packs + ' packs in your box. Add as many as you like.';
      }

      if (totalEl.textContent !== rupees(total)) {
        totalEl.textContent = rupees(total);
        totalEl.classList.add('is-bumped');
        window.setTimeout(function () { totalEl.classList.remove('is-bumped'); }, 180);
      }

      addBtn.disabled = !complete;
      addBtn.textContent = !complete && packs > 0 ? 'Add ' + short + ' more' : 'Add box to cart';

      /* One buzz, at the moment the box becomes orderable. Buzzing on every
         tap is the kind of thing people turn off. */
      if (complete && !wasComplete && navigator.vibrate) navigator.vibrate(12);
      wasComplete = complete;
    }

    grid.addEventListener('click', function (event) {
      var card = event.target.closest('[data-box-pack]');
      if (!card) return;

      if (event.target.closest('[data-box-add-one]')) {
        setQty(card, 1);
        nudge(card);
        flyToCrate(card);
        // The Add button has just been hidden, so focus would be lost to the
        // body. Hand it to the + that replaced it.
        card.querySelector('[data-box-up]').focus();
        return;
      }
      if (event.target.closest('[data-box-up]')) {
        var before = qtyOf(card);
        if (setQty(card, before + 1) > before) {
          nudge(card);
          // Only when a pack actually went in — at the cap the + does nothing,
          // and a pack flying off a stepper that refused is a lie.
          flyToCrate(card);
        }
        return;
      }
      if (event.target.closest('[data-box-down]')) {
        var left = setQty(card, qtyOf(card) - 1);
        // Back to zero: the stepper is gone, so put focus on its replacement.
        if (left === 0) card.querySelector('[data-box-add-one]').focus();
      }
    });

    grid.addEventListener('change', function (event) {
      if (!event.target.classList.contains('qty__input')) return;
      setQty(event.target.closest('[data-box-pack]'), event.target.value);
    });

    addBtn.addEventListener('click', function () {
      if (!window.PPCart || addBtn.disabled) return;
      cards.forEach(function (card) {
        var qty = qtyOf(card);
        if (!qty) return;
        window.PPCart.add({
          slug: card.getAttribute('data-box-pack'),
          name: card.getAttribute('data-name'),
          thumb: card.getAttribute('data-thumb') || '',
          price_paise: parseInt(card.getAttribute('data-price-paise'), 10) || 0
        }, qty);
        // The box has moved into the cart; leaving the steppers set would
        // invite someone to press Add again and double their order.
        inputOf(card).value = '0';
      });
      paint();
      window.PPCart.open();
    });

    paint();
  })();

  /* --- The site bar takes a ground once it is off the hero --------------- */
  (function () {
    var bar = document.querySelector('[data-site-bar]');
    if (!bar) return;

    /* A sentinel one bar-height down: while it is in view the bar is over the
       hero and stays transparent. Cheaper and steadier than measuring scroll
       on every frame. */
    var mark = document.createElement('div');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:90px;pointer-events:none';
    document.body.prepend(mark);

    if (!('IntersectionObserver' in window)) {
      bar.classList.add('is-stuck');
      return;
    }
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(mark);
  })();

})();
