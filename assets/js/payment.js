/* Protein पूरा — Razorpay Standard Checkout.
 *
 * One job: turn a basket into a verified payment, or into a rejected promise
 * with something a customer can read.
 *
 *   PPPay.pay({ items, customer })
 *     → resolves { order_id, payment_id, amount_paise, currency }
 *     → rejects  Error, with err.cancelled true if they closed the modal
 *
 * The amount is never sent from here. /api/create-order prices the basket
 * from its own list and tells Razorpay what to charge; this file only passes
 * slugs and quantities and then opens the modal on the order it gets back.
 * The key id comes back in that same response, so no key is written into a
 * static file and switching test keys for live ones is an environment change.
 *
 * Nothing here decides whether a payment succeeded. The modal's success
 * callback is just three ids; /api/verify-payment is what says they are real.
 *
 * For the Shopify port this file goes: Shopify Checkout handles payment, and
 * Razorpay becomes a payment provider in the admin rather than code.
 */
(function () {
  'use strict';

  var CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

  function cancelled(message) {
    var err = new Error(message);
    err.cancelled = true;
    return err;
  }

  /**
   * What a customer is told and what an operator needs to know are different
   * things. "Payments are not switched on yet" is right on the page and
   * useless for fixing it, so the fix goes to the console — the one place
   * someone debugging is already looking, and where a customer never is.
   */
  var DIAGNOSIS = {
    NO_RAZORPAY: [
      'Razorpay is not configured on the server that answered this request.',
      'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are both required.',
      '',
      'Deployed on Vercel: set both under Settings → Environment Variables for',
      'Production, Preview AND Development, then REDEPLOY — Vercel does not',
      'apply an environment change to a deployment that already exists.',
      '',
      'Running locally: .env is gitignored, so a fresh clone does not have one.',
      'cp .env.example .env, paste the keys in, and use `npm run dev` — a plain',
      'static file server does not run /api/* at all.',
      '',
      'Check either without paying: GET /api/payment-status'
    ],
    RAZORPAY_AUTH: [
      'Razorpay rejected our key pair. The keys are present but wrong, revoked,',
      'or a live key is being used against test mode (or the reverse).',
      'Regenerate the pair in the Razorpay dashboard and set both again.'
    ],
    RAZORPAY_UNREACHABLE: [
      'api.razorpay.com did not answer. Nothing is wrong with the keys.',
      'Check outbound network from the server: proxy, firewall or egress rules.'
    ]
  };

  function diagnose(data) {
    var lines = data && data.code && DIAGNOSIS[data.code];
    if (!lines) return;
    console.error(
      '[payment] ' + data.code + '\n\n  ' + lines.join('\n  ') + '\n'
    );
  }

  /** POST JSON, and turn a non-2xx into the server's own message. */
  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          diagnose(data);
          if (res.status === 404) {
            console.error(
              '[payment] ' + url + ' returned 404.\n\n' +
              '  The serverless functions are not deployed at all. Check that api/\n' +
              '  is in the deploy, and that this is the deployment you just pushed to.\n'
            );
          }
          throw new Error(data.error || 'That did not work. Please try again.');
        }
        return data;
      });
    }, function () {
      throw new Error('We could not reach the server. Please check your connection and try again.');
    });
  }

  /**
   * The checkout script is loaded on demand rather than blocking the page: a
   * customer who never reaches step three should not pay for it, and a
   * third-party script that fails should not take the form down with it.
   */
  var loading = null;
  function loadCheckout() {
    if (typeof window.Razorpay === 'function') return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = CHECKOUT_SRC;
      s.async = true;
      s.onload = function () {
        if (typeof window.Razorpay === 'function') resolve();
        else reject(new Error('The payment window could not load. Please try again.'));
      };
      s.onerror = function () {
        loading = null;   // let a later attempt retry rather than fail forever
        reject(new Error('The payment window could not load. Check your connection, or any ad blocker, and try again.'));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  function openModal(order, customer) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var finish = function (fn, value) {
        if (settled) return;
        settled = true;
        fn(value);
      };

      var rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Protein पूरा',
        description: 'Pre-order, first batch',
        image: '/assets/img/logo-192.png',
        prefill: {
          name: customer.name || '',
          email: customer.email || '',
          contact: customer.phone || ''
        },
        theme: { color: '#A6391A' },
        modal: {
          ondismiss: function () {
            finish(reject, cancelled('Payment cancelled. Your basket is still here.'));
          }
        },
        handler: function (response) {
          finish(resolve, response);
        }
      });

      // Fires when a specific attempt fails (wrong OTP, declined card) while
      // the modal stays open for another try. Only the dismiss above ends it.
      rzp.on('payment.failed', function (event) {
        var d = (event && event.error && event.error.description) || '';
        var el = document.getElementById('form-status');
        if (el) {
          el.textContent = d
            ? 'Payment failed: ' + d + ' You can try another method in the window.'
            : 'That payment did not go through. You can try another method in the window.';
          el.setAttribute('data-tone', 'error');
        }
      });

      rzp.open();
    });
  }

  window.PPPay = {
    /**
     * items    [{ slug, qty }]
     * customer { name, email, phone }
     */
    pay: function (items, customer) {
      return postJson('/api/create-order', { items: items })
        .then(function (order) {
          return loadCheckout().then(function () {
            return openModal(order, customer || {});
          });
        })
        .then(function (response) {
          return postJson('/api/verify-payment', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
        })
        .then(function (verified) {
          if (!verified || verified.verified !== true) {
            throw new Error('We could not verify that payment. Nothing has been charged twice — please contact us before paying again.');
          }
          return verified;
        });
    }
  };
})();
