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
  var statusEl = document.getElementById('form-status');
  var submitBtn = document.getElementById('submit-btn');
  var confirmEl = document.getElementById('confirm');

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

  /* Cities whose state is not in question, so the customer does not have to
     scroll a list of thirty-six to tell us something we can already work out.
     Names that belong to more than one state are deliberately absent --
     Aurangabad is in Maharashtra and in Bihar, Bilaspur in Chhattisgarh and in
     Himachal -- because a wrong state posted quietly is worse than an empty
     one. Old names are keys too: people still type Bangalore and Bombay. */
  var CITY_STATE = {
    // Delhi NCR
    'delhi': 'Delhi', 'new delhi': 'Delhi', 'gurgaon': 'Haryana', 'gurugram': 'Haryana',
    'faridabad': 'Haryana', 'noida': 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh',
    'ghaziabad': 'Uttar Pradesh', 'sonipat': 'Haryana', 'panipat': 'Haryana',
    'karnal': 'Haryana', 'ambala': 'Haryana', 'hisar': 'Haryana', 'rohtak': 'Haryana',
    // Maharashtra
    'mumbai': 'Maharashtra', 'bombay': 'Maharashtra', 'navi mumbai': 'Maharashtra',
    'thane': 'Maharashtra', 'pune': 'Maharashtra', 'poona': 'Maharashtra',
    'nagpur': 'Maharashtra', 'nashik': 'Maharashtra', 'nasik': 'Maharashtra',
    'kolhapur': 'Maharashtra', 'solapur': 'Maharashtra', 'amravati': 'Maharashtra',
    'sangli': 'Maharashtra', 'jalgaon': 'Maharashtra', 'akola': 'Maharashtra',
    'nanded': 'Maharashtra', 'satara': 'Maharashtra', 'ratnagiri': 'Maharashtra',
    // Karnataka
    'bengaluru': 'Karnataka', 'bangalore': 'Karnataka', 'mysuru': 'Karnataka',
    'mysore': 'Karnataka', 'mangaluru': 'Karnataka', 'mangalore': 'Karnataka',
    'hubballi': 'Karnataka', 'hubli': 'Karnataka', 'dharwad': 'Karnataka',
    'belagavi': 'Karnataka', 'belgaum': 'Karnataka', 'davangere': 'Karnataka',
    'shivamogga': 'Karnataka', 'shimoga': 'Karnataka', 'udupi': 'Karnataka',
    'ballari': 'Karnataka', 'bellary': 'Karnataka', 'tumakuru': 'Karnataka',
    // Tamil Nadu and Puducherry
    'chennai': 'Tamil Nadu', 'madras': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu',
    'madurai': 'Tamil Nadu', 'tiruchirappalli': 'Tamil Nadu', 'trichy': 'Tamil Nadu',
    'salem': 'Tamil Nadu', 'tirunelveli': 'Tamil Nadu', 'erode': 'Tamil Nadu',
    'vellore': 'Tamil Nadu', 'thoothukudi': 'Tamil Nadu', 'tirupur': 'Tamil Nadu',
    'thanjavur': 'Tamil Nadu', 'puducherry': 'Puducherry', 'pondicherry': 'Puducherry',
    // Telangana and Andhra Pradesh
    'hyderabad': 'Telangana', 'secunderabad': 'Telangana', 'warangal': 'Telangana',
    'karimnagar': 'Telangana', 'nizamabad': 'Telangana', 'khammam': 'Telangana',
    'visakhapatnam': 'Andhra Pradesh', 'vizag': 'Andhra Pradesh',
    'vijayawada': 'Andhra Pradesh', 'guntur': 'Andhra Pradesh',
    'tirupati': 'Andhra Pradesh', 'nellore': 'Andhra Pradesh',
    'rajahmundry': 'Andhra Pradesh', 'kakinada': 'Andhra Pradesh',
    'kurnool': 'Andhra Pradesh', 'anantapur': 'Andhra Pradesh',
    // Kerala
    'kochi': 'Kerala', 'cochin': 'Kerala', 'ernakulam': 'Kerala',
    'thiruvananthapuram': 'Kerala', 'trivandrum': 'Kerala', 'kozhikode': 'Kerala',
    'calicut': 'Kerala', 'thrissur': 'Kerala', 'kollam': 'Kerala',
    'kannur': 'Kerala', 'alappuzha': 'Kerala', 'kottayam': 'Kerala',
    // Gujarat
    'ahmedabad': 'Gujarat', 'amdavad': 'Gujarat', 'surat': 'Gujarat',
    'vadodara': 'Gujarat', 'baroda': 'Gujarat', 'rajkot': 'Gujarat',
    'bhavnagar': 'Gujarat', 'jamnagar': 'Gujarat', 'gandhinagar': 'Gujarat',
    'junagadh': 'Gujarat', 'anand': 'Gujarat', 'bharuch': 'Gujarat',
    // Rajasthan
    'jaipur': 'Rajasthan', 'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan',
    'kota': 'Rajasthan', 'ajmer': 'Rajasthan', 'bikaner': 'Rajasthan',
    'alwar': 'Rajasthan', 'bhilwara': 'Rajasthan', 'sikar': 'Rajasthan',
    // Uttar Pradesh and Uttarakhand
    'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'agra': 'Uttar Pradesh',
    'varanasi': 'Uttar Pradesh', 'banaras': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh',
    'allahabad': 'Uttar Pradesh', 'meerut': 'Uttar Pradesh', 'bareilly': 'Uttar Pradesh',
    'aligarh': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh', 'gorakhpur': 'Uttar Pradesh',
    'jhansi': 'Uttar Pradesh', 'mathura': 'Uttar Pradesh', 'ayodhya': 'Uttar Pradesh',
    'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand', 'rishikesh': 'Uttarakhand',
    'haldwani': 'Uttarakhand', 'roorkee': 'Uttarakhand', 'nainital': 'Uttarakhand',
    // Madhya Pradesh and Chhattisgarh
    'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'jabalpur': 'Madhya Pradesh',
    'gwalior': 'Madhya Pradesh', 'ujjain': 'Madhya Pradesh', 'sagar': 'Madhya Pradesh',
    'rewa': 'Madhya Pradesh', 'satna': 'Madhya Pradesh',
    'raipur': 'Chhattisgarh', 'bhilai': 'Chhattisgarh', 'durg': 'Chhattisgarh',
    'korba': 'Chhattisgarh',
    // West Bengal, Odisha, the east
    'kolkata': 'West Bengal', 'calcutta': 'West Bengal', 'howrah': 'West Bengal',
    'durgapur': 'West Bengal', 'asansol': 'West Bengal', 'siliguri': 'West Bengal',
    'darjeeling': 'West Bengal', 'kharagpur': 'West Bengal',
    'bhubaneswar': 'Odisha', 'cuttack': 'Odisha', 'rourkela': 'Odisha',
    'puri': 'Odisha', 'sambalpur': 'Odisha', 'berhampur': 'Odisha',
    // Bihar and Jharkhand
    'patna': 'Bihar', 'gaya': 'Bihar', 'bhagalpur': 'Bihar', 'muzaffarpur': 'Bihar',
    'darbhanga': 'Bihar', 'purnia': 'Bihar',
    'ranchi': 'Jharkhand', 'jamshedpur': 'Jharkhand', 'dhanbad': 'Jharkhand',
    'bokaro': 'Jharkhand', 'deoghar': 'Jharkhand',
    // Punjab, Haryana, the hills, the north
    'ludhiana': 'Punjab', 'amritsar': 'Punjab', 'jalandhar': 'Punjab',
    'patiala': 'Punjab', 'bathinda': 'Punjab', 'mohali': 'Punjab',
    'chandigarh': 'Chandigarh', 'shimla': 'Himachal Pradesh',
    'dharamshala': 'Himachal Pradesh', 'manali': 'Himachal Pradesh',
    'solan': 'Himachal Pradesh', 'srinagar': 'Jammu and Kashmir',
    'jammu': 'Jammu and Kashmir', 'leh': 'Ladakh',
    // Goa and the north east
    'panaji': 'Goa', 'panjim': 'Goa', 'margao': 'Goa', 'vasco da gama': 'Goa',
    'guwahati': 'Assam', 'dibrugarh': 'Assam', 'silchar': 'Assam', 'jorhat': 'Assam',
    'shillong': 'Meghalaya', 'imphal': 'Manipur', 'aizawl': 'Mizoram',
    'kohima': 'Nagaland', 'dimapur': 'Nagaland', 'agartala': 'Tripura',
    'itanagar': 'Arunachal Pradesh', 'gangtok': 'Sikkim',
    'port blair': 'Andaman and Nicobar Islands'
  };

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
      none.appendChild(nodeP('span', 'Please refresh the page. If it keeps happening, email us and we will take your pre-order by hand.'));

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

    (useSupabase ? sendToSupabase(payload) : sendToApi(payload))
      .then(function () { showConfirmation(); })
      .catch(function (err) {
        submitBtn.disabled = false;
        say(err.message || 'We could not place that pre-order. Please try again.', 'error');
      });
  });

  function sendToApi(payload) {
    return fetch('/api/preorders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'We could not place that pre-order.');
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
    var total = priced.reduce(function (sum, i) { return sum + i.price_paise * i.qty; }, 0);
    var reference = makeReference();

    var row = {
      reference: reference,
      status: 'pending',
      customer_name: payload.customer_name,
      email: payload.email,
      phone: payload.phone,
      address1: payload.address1,
      address2: payload.address2,
      city: payload.city,
      state: payload.state,
      pincode: payload.pincode,
      notes: payload.notes,
      items: priced,
      total_paise: total
    };

    var base = String(supa.url).replace(/\/+$/, '');
    return fetch(base + '/rest/v1/' + (supa.table || 'preorders'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supa.anonKey,
        Authorization: 'Bearer ' + supa.anonKey,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    }).then(function (res) {
      if (res.ok) {
        return { reference: reference, items: priced, total: total / 100, status: 'pending' };
      }
      return res.text().then(function (body) {
        console.error('[preorder] supabase rejected the row:', res.status, body);
        throw new Error('We could not save your pre-order. Please try again, or email us.');
      });
    }, function () {
      throw new Error('We could not reach the server. Please check your connection and try again.');
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

  function showConfirmation() {
    // The order is on the server now; leaving it in the cart would invite a
    // duplicate on the next visit.
    if (cart) cart.clear();

    form.hidden = true;
    // The page heading goes too: "Pre-order the first batch. Pay nothing
    // today." reads oddly above a thank you for an order already placed.
    ['page-crumbs', 'page-head'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
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

  /* --- PIN code and city ------------------------------------------------- */

  var pincodeInput = form.elements.pincode;
  var cityInput = form.elements.city;

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

  /* Fill the state in from the city, for the cities where there is only one
     answer. Never over anything the customer chose themselves: this is a
     shortcut past a thirty-six item list, not a correction of it. */
  var stateWasAuto = false;

  function fillStateFromCity() {
    var key = cityInput.value.trim().toLowerCase().replace(/\s+/g, ' ');
    var found = CITY_STATE[key];
    if (!found) return;
    if (stateSelect.value && !stateWasAuto) return;
    if (stateSelect.value === found) return;
    stateSelect.value = found;
    stateWasAuto = true;
    fieldError('state', '');
  }

  cityInput.addEventListener('input', fillStateFromCity);
  cityInput.addEventListener('change', fillStateFromCity);
  cityInput.addEventListener('blur', fillStateFromCity);

  // The moment they pick one themselves, it is theirs and we stop touching it.
  stateSelect.addEventListener('change', function () { stateWasAuto = false; });

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
