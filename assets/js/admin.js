/* Protein पूरा — admin panel.
 *
 * Every value shown here was typed by a member of the public, so all of it is
 * written with textContent and never assembled into an HTML string. A customer
 * called `<img onerror=...>` should read as a silly name, not run.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var loginCard = $('login');
  var dash = $('dash');
  var whoami = $('whoami');

  var state = { orders: [], products: [], expanded: null };

  /* --- plumbing --------------------------------------------------------- */

  function api(path, options) {
    var opts = options || {};
    return fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Something went wrong.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function note(el, message, tone) {
    el.textContent = message || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
  }

  function rupees(paise) {
    var value = paise / 100;
    return '₹' + value.toLocaleString('en-IN', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function when(iso) {
    var d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function pill(status) {
    var span = el('span', 'pill', status.replace('_', ' '));
    span.setAttribute('data-s', status);
    return span;
  }

  /** A session can lapse while the tab is open; drop straight back to sign-in. */
  function guardSession(err, msgEl) {
    if (err.status === 401) {
      showLogin('Your session has ended. Please sign in again.', 'warn');
      return true;
    }
    if (msgEl) note(msgEl, err.message, 'error');
    return false;
  }

  /* --- sign in ---------------------------------------------------------- */

  function showLogin(message, tone) {
    dash.hidden = true;
    whoami.hidden = true;
    loginCard.hidden = false;
    $('login-hint').hidden = !status.defaultPassword;
    if (message) note($('login-msg'), message, tone || 'error');
    var user = $('username');
    if (user) user.focus();
  }

  function showDash(username) {
    loginCard.hidden = true;
    dash.hidden = false;
    whoami.hidden = false;
    $('who-name').textContent = username;
    paintNotices();
    if (!status.database) return;
    loadOrders();
    loadProducts();
  }

  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var btn = $('login-btn');
    note($('login-msg'), '');
    btn.disabled = true;

    api('/api/admin', {
      method: 'POST',
      body: {
        action: 'login',
        username: $('username').value.trim(),
        password: $('password').value.trim()
      }
    })
      .then(function (data) {
        $('password').value = '';
        refreshStatus()
          .catch(function () { /* keep whatever we already knew */ })
          .then(function () { showDash(data.username); });
      })
      .catch(function (err) {
        note($('login-msg'), err.message, 'error');
      })
      .finally(function () { btn.disabled = false; });
  });

  $('signout').addEventListener('click', function () {
    api('/api/admin', { method: 'POST', body: { action: 'logout' } })
      .catch(function () { /* the cookie is cleared either way */ })
      .finally(function () { showLogin('You are signed out.', 'ok'); });
  });

  /* --- tabs ------------------------------------------------------------- */

  var tabs = [
    { tab: $('tab-orders'), panel: $('panel-orders') },
    { tab: $('tab-products'), panel: $('panel-products') }
  ];

  tabs.forEach(function (entry, index) {
    entry.tab.addEventListener('click', function () {
      if (!status.database) return;
      tabs.forEach(function (other, i) {
        other.tab.setAttribute('aria-selected', String(i === index));
        other.panel.hidden = i !== index;
      });
    });
  });

  /* --- pre-orders ------------------------------------------------------- */

  /**
   * `done` is shown after the reload finishes. Setting it before would be
   * pointless — this function clears the message box on the way in.
   */
  function loadOrders(done) {
    var filter = $('filter').value;
    var url = '/api/preorders' + (filter ? '?status=' + encodeURIComponent(filter) : '');
    note($('orders-msg'), '');

    api(url)
      .then(function (data) {
        state.orders = data.preorders || [];
        renderStats(data.counts || {});
        renderOrders();
        if (done) note($('orders-msg'), done, 'ok');
      })
      .catch(function (err) {
        if (guardSession(err, $('orders-msg'))) return;
        $('orders-body').textContent = '';
        $('orders-body').appendChild(emptyRow(7, 'Could not load pre-orders.'));
      });
  }

  function renderStats(counts) {
    var box = $('stats');
    box.textContent = '';
    ['pending', 'confirmed', 'shipped', 'cancelled'].forEach(function (key) {
      var card = el('div', 'stat');
      card.setAttribute('data-key', key);
      card.appendChild(el('span', 'stat__n', counts[key] || 0));
      card.appendChild(el('span', 'stat__k', key));
      box.appendChild(card);
    });
  }

  function emptyRow(span, message) {
    var tr = el('tr');
    var td = el('td', 'empty', message);
    td.colSpan = span;
    tr.appendChild(td);
    return tr;
  }

  function renderOrders() {
    var body = $('orders-body');
    body.textContent = '';

    if (!state.orders.length) {
      body.appendChild(emptyRow(7, 'No pre-orders yet.'));
      return;
    }

    state.orders.forEach(function (order) {
      var tr = el('tr');

      tr.appendChild(el('td', 'ref', order.reference));
      tr.appendChild(el('td', 'muted', when(order.created_at)));

      var who = el('td');
      who.appendChild(el('div', null, order.customer_name));
      who.appendChild(el('div', 'muted', order.city + ', ' + order.state));
      tr.appendChild(who);

      var packs = order.items.reduce(function (sum, i) { return sum + i.qty; }, 0);
      tr.appendChild(el('td', null, packs + (packs === 1 ? ' pack' : ' packs')));

      tr.appendChild(el('td', 'num', rupees(order.total_paise)));

      var statusCell = el('td');
      var group = el('div', 'row-status');
      group.appendChild(pill(order.status));
      group.appendChild(statusPicker(order));
      statusCell.appendChild(group);
      tr.appendChild(statusCell);

      var actions = el('td');
      var toggle = el('button', 'linkbtn', state.expanded === order.id ? 'Hide' : 'Details');
      toggle.type = 'button';
      toggle.addEventListener('click', function () {
        state.expanded = state.expanded === order.id ? null : order.id;
        renderOrders();
      });
      actions.appendChild(toggle);
      tr.appendChild(actions);

      body.appendChild(tr);
      if (state.expanded === order.id) body.appendChild(detailRow(order));
    });
  }

  function statusPicker(order) {
    var select = el('select', 'mini');
    select.setAttribute('aria-label', 'Status for ' + order.reference);
    ['pending', 'confirmed', 'shipped', 'cancelled'].forEach(function (value) {
      var option = el('option', null, value.charAt(0).toUpperCase() + value.slice(1));
      option.value = value;
      if (value === order.status) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      var next = select.value;
      select.disabled = true;
      api('/api/preorders', { method: 'PATCH', body: { id: order.id, status: next } })
        .then(function () {
          loadOrders(order.reference + ' is now ' + next + '.');
        })
        .catch(function (err) {
          select.value = order.status;
          select.disabled = false;
          guardSession(err, $('orders-msg'));
        });
    });
    return select;
  }

  function detailRow(order) {
    var tr = el('tr', 'detail');
    var td = el('td');
    td.colSpan = 7;

    var inner = el('div', 'detail__inner');

    var left = el('div');
    left.appendChild(el('h3', 'detail__h', 'Deliver to'));
    var address = el('p', 'detail__body');
    [
      order.customer_name,
      order.address1,
      order.address2,
      order.city + ', ' + order.state + ' ' + order.pincode
    ].filter(Boolean).forEach(function (line, i) {
      if (i) address.appendChild(document.createElement('br'));
      address.appendChild(document.createTextNode(line));
    });
    left.appendChild(address);

    left.appendChild(el('h3', 'detail__h', 'Contact'));
    var contact = el('p', 'detail__body');
    var mail = el('a', null, order.email);
    mail.href = 'mailto:' + order.email;
    var tel = el('a', null, '+91 ' + order.phone);
    tel.href = 'tel:+91' + order.phone;
    contact.appendChild(mail);
    contact.appendChild(document.createElement('br'));
    contact.appendChild(tel);
    left.appendChild(contact);

    var right = el('div');
    right.appendChild(el('h3', 'detail__h', 'Items'));
    var list = el('ul', 'detail__items');
    order.items.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('span', null, item.qty + ' × ' + item.name));
      li.appendChild(el('span', null, rupees(item.price_paise * item.qty)));
      list.appendChild(li);
    });
    var total = el('li');
    total.style.fontWeight = '700';
    total.style.borderTop = '1px solid var(--line)';
    total.style.marginTop = '0.3rem';
    total.style.paddingTop = '0.4rem';
    total.appendChild(el('span', null, 'Total'));
    total.appendChild(el('span', null, rupees(order.total_paise)));
    list.appendChild(total);
    right.appendChild(list);

    if (order.notes) {
      right.appendChild(el('h3', 'detail__h', 'Customer note'));
      right.appendChild(el('p', 'detail__body', order.notes));
    }

    inner.appendChild(left);
    inner.appendChild(right);
    td.appendChild(inner);
    tr.appendChild(td);
    return tr;
  }

  $('filter').addEventListener('change', loadOrders);
  $('refresh').addEventListener('click', loadOrders);

  /* --- products --------------------------------------------------------- */

  function loadProducts(done) {
    note($('products-msg'), '');
    // ?all=1 so the panel also lists hidden products.
    api('/api/products?all=1')
      .then(function (data) {
        state.products = data.products || [];
        renderProducts();
        if (done) note($('products-msg'), done, 'ok');
      })
      .catch(function (err) {
        if (guardSession(err, $('products-msg'))) return;
        $('products-body').textContent = '';
        $('products-body').appendChild(emptyRow(8, 'Could not load products.'));
      });
  }

  function renderProducts() {
    var body = $('products-body');
    body.textContent = '';

    if (!state.products.length) {
      body.appendChild(emptyRow(8, 'No products yet.'));
      return;
    }

    state.products.forEach(function (product) {
      var tr = el('tr');

      var name = el('input', 'mini mini--w');
      name.value = product.name;
      name.setAttribute('aria-label', 'Name of ' + product.name);
      tr.appendChild(cell(name));

      tr.appendChild(el('td', 'muted', product.slug));

      var price = el('input', 'mini mini--num');
      price.value = (product.price_paise / 100).toString();
      price.inputMode = 'decimal';
      price.setAttribute('aria-label', 'Price of ' + product.name);
      tr.appendChild(cell(price, 'num'));

      var pack = el('input', 'mini');
      pack.style.width = '80px';
      pack.value = product.pack_size;
      pack.setAttribute('aria-label', 'Pack size of ' + product.name);
      tr.appendChild(cell(pack));

      var protein = el('input', 'mini');
      protein.style.width = '80px';
      protein.value = product.protein;
      protein.setAttribute('aria-label', 'Protein in ' + product.name);
      tr.appendChild(cell(protein));

      var status = el('select', 'mini');
      status.setAttribute('aria-label', 'Status of ' + product.name);
      [['available', 'Available'], ['sold_out', 'Sold out'], ['hidden', 'Hidden']].forEach(function (pair) {
        var option = el('option', null, pair[1]);
        option.value = pair[0];
        if (pair[0] === product.status) option.selected = true;
        status.appendChild(option);
      });
      tr.appendChild(cell(status));

      var order = el('input', 'mini mini--num');
      order.style.width = '64px';
      order.value = String(product.sort_order);
      order.inputMode = 'numeric';
      order.setAttribute('aria-label', 'Line-up position of ' + product.name);
      tr.appendChild(cell(order, 'num'));

      var save = el('button', 'btn btn--navy btn--tiny', 'Save');
      save.type = 'button';
      save.addEventListener('click', function () {
        save.disabled = true;
        api('/api/products', {
          method: 'PATCH',
          body: {
            id: product.id,
            name: name.value,
            price: price.value,
            pack_size: pack.value,
            protein: protein.value,
            status: status.value,
            sort_order: Number(order.value)
          }
        })
          .then(function () {
            loadProducts(name.value + ' saved.');
          })
          .catch(function (err) {
            save.disabled = false;
            guardSession(err, $('products-msg'));
          });
      });
      var remove = el('button', 'btn btn--danger btn--tiny', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', function () {
        // Pre-orders keep their own copy of every line item, so removing a
        // product never rewrites an order somebody has already placed.
        if (!window.confirm('Remove ' + product.name + ' from the pre-order form?\n\nPre-orders already placed keep their items and totals.')) return;
        remove.disabled = true;
        api('/api/products', { method: 'DELETE', body: { id: product.id } })
          .then(function () { loadProducts(product.name + ' removed.'); })
          .catch(function (err) {
            remove.disabled = false;
            guardSession(err, $('products-msg'));
          });
      });

      var actions = el('div', 'rowactions');
      actions.appendChild(save);
      actions.appendChild(remove);
      tr.appendChild(cell(actions));

      body.appendChild(tr);
    });
  }

  function cell(child, className) {
    var td = el('td', className);
    td.appendChild(child);
    return td;
  }

  $('add-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var btn = $('add-btn');
    note($('add-msg'), '');
    btn.disabled = true;

    api('/api/products', {
      method: 'POST',
      body: {
        name: $('new-name').value,
        slug: $('new-slug').value,
        price: $('new-price').value,
        pack_size: $('new-pack').value,
        protein: $('new-protein').value,
        status: $('new-status').value
      }
    })
      .then(function (data) {
        $('add-form').reset();
        loadProducts();
        note($('add-msg'), data.product.name + ' added.', 'ok');
      })
      .catch(function (err) {
        if (!guardSession(err, $('add-msg'))) note($('add-msg'), err.message, 'error');
      })
      .finally(function () { btn.disabled = false; });
  });

  /* --- boot ------------------------------------------------------------- */

  /* --- boot ------------------------------------------------------------- */

  var status = { database: false, defaultPassword: false, diagnosis: null };

  var PW_DISMISSED = 'pp_admin_pw_notice_dismissed';

  function pwDismissed() {
    try { return window.localStorage.getItem(PW_DISMISSED) === '1'; } catch (e) { return false; }
  }

  $('pw-dismiss').addEventListener('click', function () {
    try { window.localStorage.setItem(PW_DISMISSED, '1'); } catch (e) { /* fine */ }
    $('pw-notice').hidden = true;
  });

  /** Says what the server can actually see, so "no database" is diagnosable. */
  function paintDiagnosis() {
    var box = $('db-diag');
    var d = status.diagnosis;
    box.textContent = '';
    if (!d) { box.hidden = true; return; }
    box.hidden = false;

    if (d.reason === 'failed') {
      box.appendChild(el('p', 'diag__h', 'A database is configured, but connecting to it failed.'));
      if (d.host) box.appendChild(el('p', null, 'Host: ' + d.host));
      if (d.message) box.appendChild(el('p', 'diag__msg', d.message));
      box.appendChild(el('p', 'diag__fix', d.hint ||
        'Check the connection string in Vercel, then redeploy.'));
      return;
    }

    box.appendChild(el('p', 'diag__h', 'No connection string reached this deployment.'));
    var vars = (d.vars || []).filter(function (n) { return !/^(npm_|VERCEL_)/.test(n); });
    if (vars.length) {
      box.appendChild(el('p', null, 'Database-ish variables it can see:'));
      var ul = el('ul', 'diag__list');
      vars.forEach(function (n) { ul.appendChild(el('li', null, n)); });
      box.appendChild(ul);
      box.appendChild(el('p', null,
        'None of these holds a postgres:// string. Add the pooled connection string as DATABASE_URL.'));
    } else {
      box.appendChild(el('p', null,
        'It can see no database variables at all — so nothing is attached to this project yet, ' +
        'or it was added after the last deployment. Redeploy after adding it.'));
    }
  }

  function paintNotices() {
    $('pw-notice').hidden = !status.defaultPassword || pwDismissed();
    $('db-notice').hidden = status.database;
    paintDiagnosis();
    // With no database there is nothing to list; the panels would only show
    // "could not load" rows under a notice that already explains why.
    $('panel-orders').hidden = !status.database;
    $('panel-products').hidden = true;
    document.querySelector('.tabs').hidden = !status.database;
  }

  function refreshStatus() {
    return api('/api/admin').then(function (data) {
      status.database = Boolean(data.database);
      status.defaultPassword = Boolean(data.defaultPassword);
      status.diagnosis = data.diagnosis || null;
      return data;
    });
  }

  $('recheck').addEventListener('click', function () {
    var btn = $('recheck');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    refreshStatus()
      .then(function () {
        paintNotices();
        if (status.database) {
          document.querySelector('.tabs').hidden = false;
          loadOrders();
          loadProducts();
        }
        btn.textContent = status.database ? 'Check again' : 'Still no database — check again';
      })
      .catch(function () { btn.textContent = 'Check again'; })
      .finally(function () { btn.disabled = false; });
  });

  refreshStatus()
    .then(function (data) {
      if (data.authenticated) showDash(data.username);
      else showLogin();
    })
    .catch(function () {
      showLogin('Could not reach the server. Please refresh.', 'error');
    });
})();
