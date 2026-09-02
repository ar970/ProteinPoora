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

  /* --- Pre-order button (placeholder until Shopify is connected) -------- */
  var cartButton = document.querySelector('[data-add-to-cart]');
  var cartStatus = document.querySelector('.buy__status');

  if (cartButton && cartStatus) {
    cartButton.addEventListener('click', function () {
      cartStatus.textContent = 'Checkout isn’t connected yet. Pre-orders open with the Shopify store.';
    });
  }
})();
