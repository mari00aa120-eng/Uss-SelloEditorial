// =========================================================
//  cart-actions.js
//  Conecta los botones "Añadir al carrito" del catálogo y de
//  la página de detalle de libro con la API real del carrito.
//  Requiere que session.js ya se haya cargado (expone window.USS).
// =========================================================

(function () {
  function slugify(text) {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function parsePrice(text) {
    if (!text) return 0;
    // Quita el prefijo de moneda "S/." o "S/" ANTES de limpiar el resto,
    // para que el punto de "S/." no se confunda con el punto decimal del precio.
    let cleaned = text.replace(/S\/\.?/gi, '');
    cleaned = cleaned.replace(/[^0-9.,]/g, '');
    // Los precios del sitio usan "." como separador decimal, sin miles con ",".
    cleaned = cleaned.replace(/,/g, '');
    const value = parseFloat(cleaned);
    return Number.isNaN(value) ? 0 : value;
  }

  function openLoginModal() {
    const overlay = document.getElementById('authModalOverlay');
    const trigger = document.querySelector('[data-auth-open="login"]');
    if (trigger) {
      trigger.click();
    } else if (overlay) {
      overlay.classList.add('is-open');
    }
  }

  function showToast(message) {
    let toast = document.getElementById('ussToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ussToast';
      toast.style.position = 'fixed';
      toast.style.bottom = '24px';
      toast.style.right = '24px';
      toast.style.background = '#1a1a1a';
      toast.style.color = '#fff';
      toast.style.padding = '12px 20px';
      toast.style.borderRadius = '8px';
      toast.style.fontSize = '14px';
      toast.style.zIndex = '9999';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => {
      toast.style.opacity = '0';
    }, 2200);
  }

  function handleAddToCart(product, quantity, button) {
    if (!window.USS || !window.USS.getSession) return;
    window.USS.getSession().then((session) => {
      if (!session.authenticated) {
        showToast('Inicia sesión para agregar libros al carrito.');
        openLoginModal();
        return;
      }
      const originalText = button ? button.textContent : null;
      if (button) {
        button.disabled = true;
        button.textContent = 'Agregando...';
      }
      window.USS.addToCart(product, quantity)
        .then((res) => {
          if (res.data.ok) {
            showToast('Se agregó "' + product.name + '" al carrito.');
            window.USS.refreshCartBadge();
          } else {
            showToast(res.data.message || 'No se pudo agregar el producto.');
          }
        })
        .catch(() => showToast('Error de conexión con el servidor.'))
        .finally(() => {
          if (button) {
            button.disabled = false;
            button.textContent = originalText;
          }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // ---------- Catálogo: varias tarjetas de producto ----------
    document.querySelectorAll('.catalog-product-card__cart').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const card = btn.closest('.catalog-product-card');
        if (!card) return;
        const name = (card.querySelector('h3') || {}).textContent || 'Producto';
        const author = (card.querySelector('.catalog-product-card__author') || {}).textContent || '';
        const priceEl = card.querySelector('.catalog-product-card__price--new') || card.querySelector('.catalog-product-card__price');
        const price = parsePrice(priceEl ? priceEl.textContent : '0');
        const imgEl = card.querySelector('img');
        const image = imgEl ? imgEl.getAttribute('src') : '';
        const product = {
          productId: slugify(name.trim()),
          name: name.trim(),
          author: author.trim(),
          price,
          image,
        };
        handleAddToCart(product, 1, btn);
      });
    });

    // ---------- Página de detalle de libro ----------
    const detailBtn = document.querySelector('.book-detail__cart-btn');
    if (detailBtn) {
      detailBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const titleEl = document.querySelector('.book-detail__info h1');
        const authorEl = document.querySelector('.book-detail__author span');
        const priceEl = document.querySelector('.book-detail__price-new');
        const imgEl = document.getElementById('bookMainImage');
        const qtyEl = document.getElementById('bookQtyValue');

        const name = titleEl ? titleEl.textContent.trim() : 'Producto';
        const product = {
          productId: slugify(name),
          name,
          author: authorEl ? authorEl.textContent.trim() : '',
          price: parsePrice(priceEl ? priceEl.textContent : '0'),
          image: imgEl ? imgEl.getAttribute('src') : '',
        };
        const quantity = qtyEl ? parseInt(qtyEl.textContent, 10) || 1 : 1;
        handleAddToCart(product, quantity, detailBtn);
      });
    }
  });
})();
