/* Protein पूरा — cart.
 *
 * Loaded on every storefront page. Holds what the customer has picked in
 * localStorage so it survives moving between pages, paints the header count,
 * and opens a drawer for a quick look. /preorder is the checkout.
 *
 * Each line keeps the name and price that were on screen when it was added, so
 * the drawer renders instantly and still works if the API is slow or down.
 * Those figures are for display only — the server prices every order from the
 * products table as it writes it, so a stale or edited cart cannot set a price.
 *
 * For the Shopify port this whole file is replaced by /cart.js and the theme's
 * cart drawer; the markup it builds is deliberately shaped like one.
 */
(function () {
  'use strict';

  var KEY = 'pp_cart_v1';
  var listeners = [];

  /* --- state ------------------------------------------------------------ */

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items)) return [];
      return data.items.filter(function (item) {
        return item && typeof item.slug === 'string' &&
          Number.isFinite(item.qty) && item.qty > 0;
      });
    } catch (err) {
      // Private browsing, cleared storage, or a value from an older shape.
      return [];
    }
  }

  function write(items) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: items }));
    } catch (err) {
      // Storage can be full or blocked. The cart still works for this page
      // view; it just will not survive navigation.
    }
    listeners.forEach(function (fn) { fn(items); });
    paintCount(items);
  }

  function clamp(n) {
    var qty = Math.floor(Number(n) || 0);
    return Math.max(0, Math.min(20, qty));
  }

  var Cart = {
    items: read,

    count: function () {
      return read().reduce(function (sum, item) { return sum + item.qty; }, 0);
    },

    subtotal: function () {
      return read().reduce(function (sum, item) {
        return sum + (item.price_paise || 0) * item.qty;
      }, 0);
    },

    /** Adds to the existing quantity; returns the new quantity for that slug. */
    add: function (product, qty) {
      var items = read();
      var wanted = clamp(qty === undefined ? 1 : qty) || 1;
      var line = items.filter(function (i) { return i.slug === product.slug; })[0];

      if (line) {
        line.qty = clamp(line.qty + wanted) || 1;
        line.name = product.name || line.name;
        if (product.price_paise) line.price_paise = product.price_paise;
        if (product.thumb) line.thumb = product.thumb;
      } else {
        items.push({
          slug: product.slug,
          name: product.name || product.slug,
          price_paise: product.price_paise || 0,
          thumb: product.thumb || '',
          qty: wanted
        });
        line = items[items.length - 1];
      }
      write(items);
      return line.qty;
    },

    /** Sets an exact quantity. Zero removes the line. */
    setQty: function (slug, qty) {
      var next = clamp(qty);
      var items = read().filter(function (i) { return i.slug !== slug || next > 0; });
      items.forEach(function (i) { if (i.slug === slug) i.qty = next; });
      write(items);
      return next;
    },

    remove: function (slug) {
      write(read().filter(function (i) { return i.slug !== slug; }));
    },

    /** Replaces the whole cart. The pre-order picker is the cart's editor, so
     *  it writes the full set rather than diffing line by line. */
    replace: function (lines) {
      write((lines || []).filter(function (line) {
        return line && line.slug && clamp(line.qty) > 0;
      }).map(function (line) {
        return {
          slug: line.slug,
          name: line.name || line.slug,
          price_paise: line.price_paise || 0,
          thumb: line.thumb || '',
          qty: clamp(line.qty)
        };
      }));
    },

    clear: function () { write([]); },

    /** Refreshes names and prices from the live product list. */
    reconcile: function (products) {
      var byslug = {};
      products.forEach(function (p) { byslug[p.slug] = p; });
      var items = read().filter(function (item) {
        var product = byslug[item.slug];
        // Drop anything that has since been delisted or made unorderable, so
        // the customer is never shown a line the server would refuse.
        return product && product.status === 'available';
      });
      items.forEach(function (item) {
        item.name = byslug[item.slug].name;
        item.price_paise = byslug[item.slug].price_paise;
      });
      write(items);
      return items;
    },

    onChange: function (fn) { listeners.push(fn); },

    open: function () { openDrawer(); },
    close: function () { closeDrawer(); }
  };

  window.PPCart = Cart;

  /* --- formatting ------------------------------------------------------- */

  function rupees(paise) {
    var value = (paise || 0) / 100;
    return '₹' + value.toLocaleString('en-IN', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /* --- header count ----------------------------------------------------- */

  function paintCount(items) {
    var n = (items || read()).reduce(function (sum, i) { return sum + i.qty; }, 0);
    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-count]'), function (badge) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cart-button]'), function (button) {
      button.setAttribute('aria-label', n === 0 ? 'Cart, empty' : 'Cart, ' + n + (n === 1 ? ' pack' : ' packs'));
    });
  }

  /* --- drawer ----------------------------------------------------------- */

  var drawer = null;
  var lastFocused = null;

  function buildDrawer() {
    if (drawer) return drawer;

    drawer = el('div', 'drawer');
    drawer.hidden = true;

    var scrim = el('div', 'drawer__scrim');
    scrim.addEventListener('click', closeDrawer);

    var panel = el('div', 'drawer__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Your cart');
    panel.tabIndex = -1;

    var head = el('div', 'drawer__head');
    head.appendChild(el('h2', 'drawer__title', 'Your cart'));
    var close = el('button', 'drawer__close');
    close.type = 'button';
    close.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>';
    close.setAttribute('aria-label', 'Close cart');
    close.addEventListener('click', closeDrawer);
    head.appendChild(close);

    var body = el('div', 'drawer__body');
    var foot = el('div', 'drawer__foot');

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
    drawer.appendChild(scrim);
    drawer.appendChild(panel);
    document.body.appendChild(drawer);

    drawer.__body = body;
    drawer.__foot = foot;
    drawer.__panel = panel;
    return drawer;
  }

  function renderDrawer() {
    var d = buildDrawer();
    var items = read();
    d.__body.textContent = '';
    d.__foot.textContent = '';

    if (!items.length) {
      var empty = el('div', 'drawer__empty');
      empty.appendChild(el('p', null, 'Your cart is empty.'));
      var browse = el('a', 'btn btn--navy', 'Browse the snacks');
      browse.href = '/#line-up';
      empty.appendChild(browse);
      d.__body.appendChild(empty);
      return;
    }

    var list = el('ul', 'drawer__list');
    items.forEach(function (item) {
      var li = el('li', 'drawer__line');

      var img = el('img', 'drawer__thumb');
      img.src = item.thumb || thumbFor(item.slug);
      img.alt = '';
      img.width = 48;
      img.height = 48;
      img.loading = 'lazy';

      var text = el('div');
      text.appendChild(el('p', 'drawer__name', item.name));
      text.appendChild(el('p', 'drawer__price', rupees(item.price_paise) + ' each'));

      var controls = el('div', 'drawer__controls');
      controls.appendChild(stepper(item));
      var drop = el('button', 'linklike', 'Remove');
      drop.type = 'button';
      drop.addEventListener('click', function () {
        Cart.remove(item.slug);
        renderDrawer();
      });
      controls.appendChild(drop);

      li.appendChild(img);
      li.appendChild(text);
      li.appendChild(controls);
      list.appendChild(li);
    });
    d.__body.appendChild(list);

    var total = el('div', 'drawer__total');
    total.appendChild(el('span', null, 'Subtotal'));
    total.appendChild(el('span', null, rupees(Cart.subtotal())));
    d.__foot.appendChild(total);

    var go = el('a', 'btn btn--navy btn--block', 'Pre-order these');
    go.href = '/preorder';
    d.__foot.appendChild(go);
    d.__foot.appendChild(el('p', 'drawer__note', 'Pay nothing now. We email you before the batch ships.'));
  }

  function stepper(item) {
    var wrap = el('div', 'qty qty--sm');

    var down = el('button', 'qty__btn', '−');
    down.type = 'button';
    down.setAttribute('aria-label', 'One less ' + item.name);

    var input = el('input', 'qty__input');
    input.type = 'number';
    input.value = String(item.qty);
    input.min = '0';
    input.max = '20';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Packs of ' + item.name);

    var up = el('button', 'qty__btn', '+');
    up.type = 'button';
    up.setAttribute('aria-label', 'One more ' + item.name);

    function set(next) {
      Cart.setQty(item.slug, next);
      renderDrawer();
    }
    down.addEventListener('click', function () { set(item.qty - 1); });
    up.addEventListener('click', function () { set(item.qty + 1); });
    input.addEventListener('change', function () { set(input.value); });

    wrap.appendChild(down);
    wrap.appendChild(input);
    wrap.appendChild(up);
    return wrap;
  }

  /* Pack shots, when the page happens to carry the map. Falls back to the
     brand seal, so a product with no thumbnail still renders a tidy row. */
  var thumbs = null;
  function thumbFor(slug) {
    if (thumbs === null) {
      thumbs = {};
      try {
        var node = document.getElementById('pack-thumbs');
        if (node) thumbs = JSON.parse(node.textContent);
      } catch (err) {
        thumbs = {};
      }
    }
    return thumbs[slug] || '/assets/img/logo-96.png';
  }

  function openDrawer() {
    var d = buildDrawer();
    renderDrawer();
    lastFocused = document.activeElement;
    d.hidden = false;
    // Next frame, so the transition has a state to move from.
    requestAnimationFrame(function () { d.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    d.__panel.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    var done = function () { drawer.hidden = true; };
    // Wait for the slide-out, but never hang if transitions are off.
    var fallback = window.setTimeout(done, 400);
    drawer.__panel.addEventListener('transitionend', function once() {
      window.clearTimeout(fallback);
      drawer.__panel.removeEventListener('transitionend', once);
      done();
    });
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab' || !drawer || drawer.hidden) return;

    // Keep focus inside the dialog while it is open.
    var focusable = drawer.__panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* --- wiring ----------------------------------------------------------- */

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest ? event.target.closest('[data-cart-button]') : null;
    if (trigger) {
      event.preventDefault();
      openDrawer();
      return;
    }

    var add = event.target.closest ? event.target.closest('[data-add-to-cart]') : null;
    if (!add) return;
    event.preventDefault();

    // A product page has a quantity stepper above the button; a line-up card
    // does not, and means one pack.
    var qty = 1;
    var stepperInput = add.getAttribute('data-qty-from')
      ? document.querySelector(add.getAttribute('data-qty-from'))
      : null;
    if (stepperInput) qty = parseInt(stepperInput.value, 10) || 1;

    Cart.add({
      slug: add.getAttribute('data-add-to-cart'),
      name: add.getAttribute('data-name'),
      thumb: add.getAttribute('data-thumb') || '',
      price_paise: parseInt(add.getAttribute('data-price-paise'), 10) || 0
    }, qty);

    openDrawer();
  });

  // Another tab changed the cart — keep this one honest.
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY) return;
    paintCount();
    if (drawer && !drawer.hidden) renderDrawer();
  });

  paintCount();
})();
