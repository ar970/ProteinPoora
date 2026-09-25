/* Protein पूरा — pre-order form.
 *
 * The line-up is rendered from the catalogue in the page, so the form works
 * before, and without, any request. Where the order goes depends on what is
 * configured, and the page tries the simpler one first:
 *
 *   1. Supabase, if assets/js/store-config.js has a project URL and anon key.
 *      The browser writes the row itself. Nothing of ours is in the path.
 *   2. Otherwise /api/preorders, which needs a database attached to the
 *      Vercel project. That path re-prices every order server-side.
 *
 * For the Shopify port: the catalogue becomes
 * {% for product in collection.products %}, the submit becomes /cart/add, and
 * this script keeps only the quantity and summary behaviour.
 */
(function () {
  'use strict';

  var form = document.getElementById('preorder-form');
  if (!form) return;

  var picker = document.getElementById('picker');
  var summaryLines = document.getElementById('summary-lines');
  var summaryEmpty = document.getElementById('summary-empty');
  var summaryTotal = document.getElementById('summary-total');
  var summarySubtotal = document.getElementById('summary-subtotal');
  var summaryDelivery = document.getElementById('summary-delivery');
  var summaryNudge = document.getElementById('summary-nudge');
  var statusEl = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');

  var thumbs = {};
  var catalogue = [];
  try {
    var raw = document.getElementById('catalogue');
    if (raw) {
      catalogue = JSON.parse(raw.textContent);
      catalogue.forEach(function (p) {
        p.status = p.status || 'available';
        thumbs[p.slug] = p.thumb;
      });
    }
  } catch (err) {
    catalogue = [];
  }

  // Supabase is optional. With it, the browser writes the order straight to
  // the table and no server of ours is involved at all.
  var supa = window.PP_SUPABASE || {};
  var useSupabase = Boolean(supa.url && supa.anonKey);

  var products = catalogue.slice();
  var chosen = Object.create(null); // slug -> qty

  /* A loose pack is only sold five or more at a time. The number comes from
     the cart so there is one of it on the client; the server has its own and
     is the one that counts. */
  var BOX_MIN = (window.PPCart && window.PPCart.BOX_MIN) || 5;

  /* Delivery, from the cart so there is one copy of it on the client. The
     server prices the order either way; this is what the customer is shown
     before they agree to it. */
  var FREE_DELIVERY_FROM = (window.PPCart && window.PPCart.FREE_DELIVERY_FROM) || 45000;
  function deliveryFor(subtotal) {
    if (!subtotal) return 0;
    return window.PPCart ? window.PPCart.deliveryFor(subtotal)
      : (subtotal >= FREE_DELIVERY_FROM ? 0 : 10000);
  }

  /** True from the moment the payment window opens until it resolves. */
  var submitting = false;

  function boxCount() {
    return products.reduce(function (sum, p) {
      return p.box && chosen[p.slug] ? sum + chosen[p.slug] : sum;
    }, 0);
  }

  /** Packs short of a box, or 0 when the order is fine as it stands. */
  function boxShortfall() {
    var n = boxCount();
    return n > 0 && n < BOX_MIN ? BOX_MIN - n : 0;
  }

  var cart = window.PPCart || null;

  /** Mirrors the picker's quantities into the shared cart. */
  function syncCart() {
    if (!cart) return;
    var lines = products
      .filter(function (p) { return chosen[p.slug]; })
      .map(function (p) {
        return {
          slug: p.slug, name: p.name, price_paise: p.price_paise,
          thumb: thumbs[p.slug] || '', qty: chosen[p.slug]
        };
      });
    cart.replace(lines);
  }



  /* --- helpers ---------------------------------------------------------- */

  function rupees(paise) {
    var value = paise / 100;
    // Whole rupees read better without ".00"; paise matter when they exist.
    return '₹' + value.toLocaleString('en-IN', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function say(message, tone) {
    statusEl.textContent = message || '';
    if (tone) statusEl.setAttribute('data-tone', tone);
    else statusEl.removeAttribute('data-tone');
  }

  function fieldError(name, message) {
    var msg = form.querySelector('[data-error-for="' + name + '"]');
    if (!msg) return;
    msg.textContent = message || '';
    var field = msg.closest('.field');
    if (field) field.classList.toggle('is-invalid', Boolean(message));
  }

  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll('[data-error-for]'), function (el) {
      el.textContent = '';
      var field = el.closest('.field');
      if (field) field.classList.remove('is-invalid');
    });
  }

  function nodeP(tag, text) {
    var node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  /* --- product picker --------------------------------------------------- */

  function renderPicker() {
    picker.removeAttribute('data-loading');
    picker.textContent = '';

    if (!products.length) {
      var none = document.createElement('li');
      none.className = 'notice';

      // Only reachable if the catalogue in the page is empty or malformed —
      // the API can no longer empty this list.
      none.appendChild(nodeP('strong', 'The line-up will not load.'));
      none.appendChild(nodeP('span', 'Please refresh the page. If it keeps happening, call 93113 49922 and we will take your order by hand.'));

      picker.appendChild(none);
      return;
    }

    var split = false;
    products.forEach(function (product) {
      // One heading between the combos and the loose packs, so the box rows
      // are not read as five suspiciously cheap products. The rate comes from
      // the row it is describing rather than being typed in again here.
      if (product.box && !split) {
        split = true;
        var head = document.createElement('li');
        head.className = 'picker__split';
        head.appendChild(nodeP('strong', 'Or build your own box'));
        head.appendChild(nodeP('span', 'Any ' + BOX_MIN + ' packs or more, ' +
          rupees(product.price_paise) + ' each. Mix them however you like.'));
        picker.appendChild(head);
      }

      var out = product.status !== 'available';
      var row = document.createElement('li');
      row.className = 'picker__row' + (out ? ' is-out' : '');
      row.setAttribute('data-slug', product.slug);

      var img = document.createElement('img');
      img.className = 'picker__thumb';
      img.src = thumbs[product.slug] || '/assets/img/logo-96.png';
      img.alt = '';
      img.width = 56;
      img.height = 56;
      img.loading = 'lazy';
      img.decoding = 'async';

      var text = document.createElement('div');
      var name = document.createElement('p');
      name.className = 'picker__name';
      name.textContent = product.name;
      var meta = document.createElement('p');
      meta.className = 'picker__meta';
      meta.textContent = [rupees(product.price_paise), product.pack_size, product.protein ? product.protein + ' protein' : '']
        .filter(Boolean).join(' · ');
      text.appendChild(name);
      text.appendChild(meta);

      row.appendChild(img);
      row.appendChild(text);

      if (out) {
        var flag = document.createElement('span');
        flag.className = 'picker__out';
        flag.textContent = product.status === 'sold_out' ? 'Sold out' : 'Unavailable';
        row.appendChild(flag);
      } else {
        row.appendChild(stepper(product));
      }

      picker.appendChild(row);
    });
  }

  function stepper(product) {
    var wrap = document.createElement('div');
    wrap.className = 'qty';

    var down = document.createElement('button');
    down.type = 'button';
    down.className = 'qty__btn';
    down.textContent = '−';
    down.setAttribute('aria-label', 'One less ' + product.name);

    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'qty__input';
    input.value = String(chosen[product.slug] || 0);
    input.min = '0';
    input.max = '20';
    input.step = '1';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Packs of ' + product.name);

    var up = document.createElement('button');
    up.type = 'button';
    up.className = 'qty__btn';
    up.textContent = '+';
    up.setAttribute('aria-label', 'One more ' + product.name);

    function set(next) {
      var qty = Math.max(0, Math.min(20, Math.floor(Number(next) || 0)));
      input.value = String(qty);
      if (qty > 0) chosen[product.slug] = qty;
      else delete chosen[product.slug];
      var row = wrap.closest('.picker__row');
      if (row) row.classList.toggle('is-chosen', qty > 0);
      renderSummary();
      syncCart();
    }

    down.addEventListener('click', function () { set(Number(input.value) - 1); });
    up.addEventListener('click', function () { set(Number(input.value) + 1); });
    input.addEventListener('change', function () { set(input.value); });

    wrap.appendChild(down);
    wrap.appendChild(input);
    wrap.appendChild(up);

    // Reflect a pre-selection arriving from ?product=
    if (chosen[product.slug]) set(chosen[product.slug]);
    return wrap;
  }

  /* --- summary ---------------------------------------------------------- */

  function renderSummary() {
    var goods = 0;
    summaryLines.textContent = '';

    products.forEach(function (product) {
      var qty = chosen[product.slug];
      if (!qty) return;
      var amount = product.price_paise * qty;
      goods += amount;

      var li = document.createElement('li');
      li.className = 'summary__line';
      var left = document.createElement('span');
      left.textContent = qty + ' × ' + product.name;
      var right = document.createElement('span');
      right.textContent = rupees(amount);
      li.appendChild(left);
      li.appendChild(right);
      summaryLines.appendChild(li);
    });

    var any = summaryLines.children.length > 0;
    var delivery = deliveryFor(goods);
    summaryEmpty.hidden = any;
    summarySubtotal.textContent = rupees(goods);
    summaryDelivery.textContent = delivery ? rupees(delivery) : 'Free';
    summaryDelivery.classList.toggle('is-free', delivery === 0);
    summaryTotal.textContent = rupees(goods + delivery);

    // Only worth saying once there is something in the order to add to.
    if (any && delivery) {
      summaryNudge.hidden = false;
      summaryNudge.textContent = 'Add ' + rupees(FREE_DELIVERY_FROM - goods) +
        ' more and delivery is free.';
    } else {
      summaryNudge.hidden = true;
    }

    paintBoxWarning();
  }

  /* The submit button is switched off while the box is short, because paying
     first and being refused afterwards is the one outcome worth engineering
     away. The message sits beside the total, where the number that changes is.
     Razorpay is never opened for an order the server would reject. */
  function paintBoxWarning() {
    var short = boxShortfall();
    var note = document.getElementById('box-warning');

    // The steppers stay live while the Razorpay window is open. Without this,
    // nudging one would hand the button back mid-payment.
    if (submitting) return;

    if (!short) {
      if (note) note.hidden = true;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pay and place order';
      return;
    }

    if (!note) {
      note = document.createElement('p');
      note.id = 'box-warning';
      note.className = 'summary__warn';
      note.setAttribute('role', 'status');
      // summaryTotal is the <span> holding the figure; the row is its parent.
      // Putting the note inside that row would nest a <p> in a <p> and break
      // the flex that keeps "Total" and the amount at opposite ends.
      var row = summaryTotal.closest('.summary__total');
      row.parentNode.insertBefore(note, row.nextSibling);
    }
    note.hidden = false;
    note.textContent = 'A box is ' + BOX_MIN + ' packs or more, and you have ' +
      boxCount() + '. Add ' + short + (short === 1 ? ' more pack' : ' more packs') +
      ', or take a combo instead.';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Add ' + short + ' more to your box';
  }

  /* --- validation ------------------------------------------------------- */

  // Mirrors api/_lib/http.js. The server is the authority; this only saves the
  // customer a round trip.
  var RULES = {
    customer_name: function (v) { return v.length >= 2 ? '' : 'Please enter your full name.'; },
    email: function (v) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v) ? '' : 'That email address does not look right.'; },
    phone: function (v) {
      return /^(?:\+?91)?[6-9]\d{9}$/.test(v.replace(/[\s()-]/g, '')) ? '' : 'Enter a 10-digit Indian mobile number.';
    },
    address1: function (v) { return v.length >= 4 ? '' : 'Please enter your street address.'; },
    /* We deliver across India, so this is a format check, not a serviceability
       one: six digits, first never 0. Mirrors api/_lib/http.js, which is the
       rule that counts. */
    pincode: function (v) {
      if (!/^\d{6}$/.test(v)) return 'Enter a 6-digit PIN code.';
      if (!/^[1-9]\d{5}$/.test(v)) return 'That is not a valid Indian PIN code — it cannot start with a zero.';
      return '';
    },
    city: function (v) { return v.length >= 2 ? '' : 'Please enter your city or town.'; },
    state: function (v) { return v ? '' : 'Please choose your state.'; }
  };

  function validate() {
    clearErrors();
    var firstBad = null;

    Object.keys(RULES).forEach(function (name) {
      var input = form.elements[name];
      if (!input) return;
      var message = RULES[name](input.value.trim());
      if (message) {
        fieldError(name, message);
        if (!firstBad) firstBad = input;
      }
    });

    if (!Object.keys(chosen).length) {
      say('Choose at least one snack before placing your order.', 'error');
      if (!firstBad) {
        picker.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return false;
      }
    }

    // The button is already off in this state, so this only catches a submit
    // that got past it — a stray Enter key, an extension, a stale page.
    var short = boxShortfall();
    if (short) {
      say('A box is ' + BOX_MIN + ' packs or more. Add ' + short +
          (short === 1 ? ' more pack' : ' more packs') + ', or take a combo instead.', 'error');
      if (!firstBad) {
        picker.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return false;
      }
    }

    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      say('Please check the highlighted fields.', 'error');
      return false;
    }
    return Object.keys(chosen).length > 0;
  }

  /* --- submit ----------------------------------------------------------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    say('');
    if (!validate()) return;

    var payload = {
      items: Object.keys(chosen).map(function (slug) { return { slug: slug, qty: chosen[slug] }; }),
      customer_name: form.elements.customer_name.value,
      email: form.elements.email.value,
      phone: form.elements.phone.value,
      address1: form.elements.address1.value,
      address2: form.elements.address2.value,
      city: form.elements.city.value,
      state: form.elements.state.value,
      pincode: form.elements.pincode.value,
      notes: form.elements.notes.value
    };

    submitting = true;
    submitBtn.disabled = true;
    say('Opening the payment window…');

    // Payment first, order second. The row is only written once
    // /api/verify-payment has confirmed the money, so a dismissed modal or a
    // failed card leaves nothing behind to reconcile.
    takePayment(payload)
      .then(function (paid) {
        say('Payment received. Placing your order…');
        payload.payment = paid;
        return useSupabase ? sendToSupabase(payload) : sendToApi(payload);
      })
      .then(goToThankYou)
      .catch(function (err) {
        submitting = false;
        // Hand the button back through the same path that decides its label,
        // so a cart edited during payment is reflected rather than assumed.
        paintBoxWarning();
        say(
          err.message || 'We could not place that order. Please try again.',
          err.cancelled ? null : 'error'
        );
      });
  });

  /**
   * Resolves with the verified payment. There is deliberately no path that
   * skips this and places a free order: if payments are misconfigured the
   * customer is told so, rather than being promised snacks nobody charged for.
   */
  function takePayment(payload) {
    if (!window.PPPay) {
      return Promise.reject(new Error('The payment window is unavailable. Please reload the page and try again.'));
    }
    return window.PPPay.pay(payload.items, {
      name: payload.customer_name,
      email: payload.email,
      phone: payload.phone
    }, payload);
  }

  function sendToApi(payload) {
    return fetch('/api/preorders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'We could not place that order.');
        return data;
      });
    }, function () {
      throw new Error('We could not reach the server. Please check your connection and try again.');
    });
  }

  /**
   * Writes the row itself, using the public anon key. The table's row-level
   * security allows insert and nothing else, so this cannot read anybody's
   * order back — including its own, which is why the reference is generated
   * here rather than read from the response.
   */
  function sendToSupabase(payload) {
    var priced = payload.items.map(function (line) {
      var product = products.filter(function (p) { return p.slug === line.slug; })[0] || {};
      return {
        slug: line.slug,
        name: product.name || line.slug,
        qty: line.qty,
        price_paise: product.price_paise || 0
      };
    });
    var goods = priced.reduce(function (sum, i) { return sum + i.price_paise * i.qty; }, 0);
    var delivery = deliveryFor(goods);
    var total = goods + delivery;
    var reference = makeReference();

    /* The delivery charge has no column of its own, and inventing one would
       make this insert depend on a migration — which is exactly how an order
       was lost before. It goes in `notes`, where a person packing the order
       will read it, and `total_paise` is what was charged rather than what the
       goods came to, so it matches the Razorpay dashboard. `paid_paise` is
       Razorpay's own figure for the same number: if the two ever disagree,
       the row says so instead of hiding it. */
    var charges = delivery
      ? 'Delivery ₹' + (delivery / 100) + ' (goods ₹' + (goods / 100) + ')'
      : 'Delivery free (goods ₹' + (goods / 100) + ')';
    /* Charges first, then the customer's note. The field is capped at 500 and
       a customer who fills it would otherwise push the delivery line off the
       end. Their instructions are also on the Razorpay order, so putting them
       second loses nothing; the charge line has only this one home. */
    var customerNotes = String(payload.notes || '').trim();
    var notes = charges + (customerNotes ? ' — ' + customerNotes : '');

    var paid = payload.payment || {};
    var row = {
      reference: reference,
      status: 'paid',
      // What the payment actually was, as /api/verify-payment reported it —
      // not as the browser or the modal claimed. The figures to reconcile
      // against the Razorpay dashboard.
      razorpay_order_id: paid.order_id || null,
      razorpay_payment_id: paid.payment_id || null,
      paid_paise: typeof paid.amount_paise === 'number' ? paid.amount_paise : null,
      customer_name: payload.customer_name,
      email: payload.email,
      phone: payload.phone,
      address1: payload.address1,
      address2: payload.address2,
      city: payload.city,
      state: payload.state,
      pincode: payload.pincode,
      notes: notes.slice(0, 500),
      items: priced,
      total_paise: total
    };

    var base = String(supa.url).replace(/\/+$/, '');
    var endpoint = base + '/rest/v1/' + (supa.table || 'preorders');

    function post(body) {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supa.anonKey,
          Authorization: 'Bearer ' + supa.anonKey,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(body)
      });
    }

    var done = { reference: reference, items: priced, total: total / 100, status: 'paid' };

    /* The payment has already happened by the time we get here, so a rejected
       row is not a failed order -- it is a paid order with nowhere to live.
       Postgres rejects the whole insert over one unknown column, which is
       exactly what a table that predates the Razorpay migration does, so the
       second attempt drops the columns that are merely useful and keeps the
       ones we cannot deliver without. The address is on the payment in
       Razorpay either way; this is about not losing it here as well. */
    var OPTIONAL = ['razorpay_order_id', 'razorpay_payment_id', 'paid_paise'];

    return post(row).then(function (res) {
      if (res.ok) return done;

      return res.text().then(function (body) {
        var unknownColumn = res.status === 400 && /column|schema cache|PGRST204/i.test(body);
        if (!unknownColumn) throw new Error(body);

        console.error(
          '[preorder] the orders table is missing a column, so the row was refused:\n  ' +
          body + '\n\n  Run the alter table at the bottom of docs/supabase-setup.sql.\n' +
          '  Retrying without ' + OPTIONAL.join(', ') + ' so the address is not lost too.'
        );

        var trimmed = {};
        Object.keys(row).forEach(function (k) {
          if (OPTIONAL.indexOf(k) === -1) trimmed[k] = row[k];
        });
        // Keep the payment reference where it will still be read.
        trimmed.notes = [row.notes, 'payment ' + (paid.payment_id || 'unknown')]
          .filter(Boolean).join(' | ');

        return post(trimmed).then(function (again) {
          if (again.ok) return done;
          return again.text().then(function (b2) { throw new Error(b2); });
        });
      });
    }).catch(function (err) {
      console.error('[preorder] supabase rejected the order:', err && err.message);
      throw new Error(
        'Your payment went through, but we could not save the order. ' +
        'Please call 93113 49922 with your name — we have your payment and will deliver it.'
      );
    });
  }

  /** PP- plus six characters, skipping ones that are ambiguous when read out. */
  function makeReference() {
    var alphabet = '23456789ABCDEFGHJKLMNPQRTUVWXY';
    var out = '';
    var bytes = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return 'PP-' + out;
  }

  var THANK_YOU = '/thank-you';

  function goToThankYou() {
    // Empty the cart before leaving: the order is placed, and carrying it to
    // the next visit would invite a duplicate.
    if (cart) cart.clear();
    // replace(), not assign(), so Back does not land on a filled-in form whose
    // order has already gone in.
    window.location.replace(THANK_YOU);
  }

  /* --- boot ------------------------------------------------------------- */

  /* --- PIN code and city ------------------------------------------------- */

  var pincodeInput = form.elements.pincode;

  /* A PIN code is six digits and nothing else, so nothing else can be typed
     into the box. Doing it here rather than only on submit means a pasted
     phone number or a stray letter never survives long enough to be argued
     with -- and the caret is put back where it was, or the browser drops it
     to the end on every keystroke. */
  pincodeInput.addEventListener('input', function () {
    var at = this.selectionStart;
    var before = this.value;
    var clean = before.replace(/\D/g, '').slice(0, 6);
    if (clean === before) return;
    this.value = clean;
    // Every character removed before the caret pulls it one place left.
    var removed = before.slice(0, at).replace(/\D/g, '').length;
    try { this.setSelectionRange(removed, removed); } catch (err) { /* older browsers */ }
  });

  // Clear a field's error as soon as the customer starts fixing it.
  form.addEventListener('input', function (event) {
    if (event.target.name && RULES[event.target.name]) fieldError(event.target.name, '');
  });

  // Start from whatever is in the cart.
  if (cart) {
    cart.items().forEach(function (item) { chosen[item.slug] = item.qty; });
  }

  // ?product= still works, for a link followed with JavaScript disabled on the
  // page that produced it, or a URL shared directly.
  var params = new URLSearchParams(window.location.search);
  var preselect = params.get('product');
  if (preselect && !chosen[preselect]) {
    var wanted = parseInt(params.get('qty'), 10);
    chosen[preselect] = Math.min(20, Math.max(1, isNaN(wanted) ? 1 : wanted));
  }

  // The picker is drawn from the catalogue in the page, so it is on screen
  // before any request is made and stays there whatever a request does.
  dropUnavailable();
  renderPicker();
  renderSummary();
  syncCart();

  // With Supabase configured there is no products API to consult. Otherwise
  // refresh from it, so a price or an availability change the admin makes
  // shows up here. A failure is not fatal: the catalogue already rendered.
  if (!useSupabase) {
    fetch('/api/products', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.products) || !data.products.length) return;
        products = data.products.map(function (live) {
          var known = catalogue.filter(function (c) { return c.slug === live.slug; })[0] || {};
          return Object.assign({}, known, live);
        });
        products.forEach(function (p) { if (p.thumb) thumbs[p.slug] = p.thumb; });
        dropUnavailable();
        renderPicker();
        renderSummary();
        syncCart();
      })
      .catch(function () {
        // Leave the catalogue on screen. The order still posts, and the server
        // prices and validates it when it arrives.
      });
  }

  /** Never offer a line the order would be refused for. */
  function dropUnavailable() {
    Object.keys(chosen).forEach(function (slug) {
      var match = products.filter(function (p) { return p.slug === slug; })[0];
      if (!match || match.status !== 'available') delete chosen[slug];
    });
  }
})();
