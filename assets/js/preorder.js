/* Protein पूरा — pre-order form.
 *
 * The line-up is read from /api/products, never from a list in this file, so
 * a price the admin changes is the price the customer sees and the price the
 * order is written at. The browser only ever sends slugs and quantities; the
 * server prices the order itself.
 *
 * For the Shopify port: the picker becomes {% for product in collection.products %}
 * and this script keeps only the quantity and summary behaviour.
 */
(function () {
  'use strict';

  var form = document.getElementById('preorder-form');
  if (!form) return;

  var picker = document.getElementById('picker');
  var summaryLines = document.getElementById('summary-lines');
  var summaryEmpty = document.getElementById('summary-empty');
  var summaryTotal = document.getElementById('summary-total');
  var statusEl = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var confirmEl = document.getElementById('confirm');

  var thumbs = {};
  try {
    var raw = document.getElementById('pack-thumbs');
    if (raw) thumbs = JSON.parse(raw.textContent);
  } catch (err) {
    thumbs = {};
  }

  var products = [];
  var chosen = Object.create(null); // slug -> qty

  var STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry'
  ];

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

  /* --- product picker --------------------------------------------------- */

  function renderPicker() {
    picker.removeAttribute('data-loading');
    picker.textContent = '';

    if (!products.length) {
      var none = document.createElement('li');
      none.className = 'summary__empty';
      none.textContent = 'The line-up is not available right now. Please try again shortly.';
      picker.appendChild(none);
      return;
    }

    products.forEach(function (product) {
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
    var total = 0;
    summaryLines.textContent = '';

    products.forEach(function (product) {
      var qty = chosen[product.slug];
      if (!qty) return;
      var amount = product.price_paise * qty;
      total += amount;

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
    summaryEmpty.hidden = any;
    summaryTotal.textContent = rupees(total);
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
    city: function (v) { return v ? '' : 'Please enter your city.'; },
    state: function (v) { return v ? '' : 'Please choose your state.'; },
    pincode: function (v) { return /^[1-9]\d{5}$/.test(v) ? '' : 'Enter a 6-digit PIN code.'; }
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
      say('Choose at least one snack before placing your pre-order.', 'error');
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

    submitBtn.disabled = true;
    say('Placing your pre-order…');

    fetch('/api/preorders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          submitBtn.disabled = false;
          say(result.data.error || 'We could not place that pre-order. Please try again.', 'error');
          return;
        }
        showConfirmation(result.data, payload.email);
      })
      .catch(function () {
        submitBtn.disabled = false;
        say('We could not reach the server. Please check your connection and try again.', 'error');
      });
  });

  function showConfirmation(order, email) {
    document.getElementById('confirm-ref').textContent = order.reference;
    document.getElementById('confirm-total').textContent = rupees(Math.round(order.total * 100));
    document.getElementById('confirm-email').textContent = email;

    var list = document.getElementById('confirm-lines');
    list.textContent = '';
    (order.items || []).forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'summary__line';
      var left = document.createElement('span');
      left.textContent = item.qty + ' × ' + item.name;
      var right = document.createElement('span');
      right.textContent = rupees(item.price_paise * item.qty);
      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });

    form.hidden = true;
    confirmEl.hidden = false;
    confirmEl.setAttribute('tabindex', '-1');
    confirmEl.focus();
    confirmEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* --- boot ------------------------------------------------------------- */

  var stateSelect = form.elements.state;
  STATES.forEach(function (name) {
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    stateSelect.appendChild(option);
  });

  // Clear a field's error as soon as the customer starts fixing it.
  form.addEventListener('input', function (event) {
    if (event.target.name && RULES[event.target.name]) fieldError(event.target.name, '');
  });

  // A product page can hand over both the snack and the quantity chosen there.
  var params = new URLSearchParams(window.location.search);
  var preselect = params.get('product');
  if (preselect) {
    var wanted = parseInt(params.get('qty'), 10);
    chosen[preselect] = Math.min(20, Math.max(1, isNaN(wanted) ? 1 : wanted));
  }

  fetch('/api/products', { headers: { Accept: 'application/json' } })
    .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('unavailable')); })
    .then(function (data) {
      products = data.products || [];
      // Drop a pre-selection that is not on sale, so the summary cannot show
      // a line the server will refuse.
      Object.keys(chosen).forEach(function (slug) {
        var match = products.filter(function (p) { return p.slug === slug; })[0];
        if (!match || match.status !== 'available') delete chosen[slug];
      });
      renderPicker();
      renderSummary();
    })
    .catch(function () {
      products = [];
      renderPicker();
      say('We could not load the line-up. Please refresh the page.', 'error');
    });
})();
