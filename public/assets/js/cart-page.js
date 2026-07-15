// =========================================================
//  cart-page.js
//  Renderiza el carrito real del usuario (carrito.html)
//  usando la API /api/cart. Requiere sesión iniciada.
// =========================================================

(function () {
  const listEl = document.getElementById('cartItemsList');
  const countEl = document.getElementById('cartItemCount');
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountEl = document.getElementById('cartDiscount');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.querySelector('.cart-summary__checkout');

  function formatSoles(value) {
    return 'S/ ' + Number(value).toFixed(2);
  }

  function renderEmptyState() {
    listEl.innerHTML =
      '<div style="padding: 48px 24px; text-align:center; color:#777;">' +
      '<p style="font-size:16px; margin-bottom:12px;">Tu carrito está vacío.</p>' +
      '<a href="catalogo.html" class="btn btn--primary">Ver catálogo</a>' +
      '</div>';
    countEl.textContent = '0';
    subtotalEl.textContent = formatSoles(0);
    discountEl.textContent = formatSoles(0);
    totalEl.textContent = formatSoles(0);
    if (checkoutBtn) checkoutBtn.disabled = true;
  }

  function renderLoginRequired() {
    listEl.innerHTML =
      '<div style="padding: 48px 24px; text-align:center; color:#777;">' +
      '<p style="font-size:16px; margin-bottom:12px;">Inicia sesión para ver tu carrito.</p>' +
      '<button type="button" class="btn btn--primary" data-auth-open="login">Iniciar sesión</button>' +
      '</div>';
    if (checkoutBtn) checkoutBtn.disabled = true;
  }

  function renderItems(items, total, count) {
    if (items.length === 0) {
      renderEmptyState();
      return;
    }

    listEl.innerHTML = items
      .map(
        (item) => `
      <div class="cart-item" data-item-id="${item.id}">
        <div class="cart-item__product">
          <img src="${item.image || 'assets/sipan-cover.png'}" alt="${escapeHtml(item.name)}" class="cart-item__img">
          <div class="cart-item__info">
            <h3>${escapeHtml(item.name)}</h3>
            <p class="cart-item__authors">${escapeHtml(item.author || '')}</p>
          </div>
        </div>
        <div class="cart-item__price">
          <span class="cart-item__price-new">${formatSoles(item.price)}</span>
        </div>
        <div class="cart-item__qty">
          <div class="cart-item__qty-control">
            <button type="button" class="cart-qty-minus" data-item-id="${item.id}" aria-label="Disminuir cantidad">-</button>
            <span class="cart-item__qty-value">${item.quantity}</span>
            <button type="button" class="cart-qty-plus" data-item-id="${item.id}" aria-label="Aumentar cantidad">+</button>
          </div>
        </div>
        <div class="cart-item__subtotal">${formatSoles(item.subtotal)}</div>
        <button type="button" class="cart-item__remove" data-item-id="${item.id}" aria-label="Eliminar producto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>`
      )
      .join('');

    const shipping = total > 0 ? 10 : 0;
    countEl.textContent = count;
    subtotalEl.textContent = formatSoles(total);
    discountEl.textContent = '- ' + formatSoles(0);
    totalEl.textContent = formatSoles(total + shipping);
    if (checkoutBtn) checkoutBtn.disabled = false;

    wireItemEvents();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function loadCart() {
    fetch('/api/cart')
      .then((r) => {
        if (r.status === 401) {
          renderLoginRequired();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.ok) {
          renderItems(data.items, data.total, data.count);
        }
      })
      .catch(() => {
        listEl.innerHTML = '<p style="padding:24px; text-align:center; color:#c0392b;">No se pudo cargar el carrito.</p>';
      });
  }

  function updateQuantity(itemId, quantity) {
    fetch('/api/cart/' + itemId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    }).then(() => {
      loadCart();
      if (window.USS) window.USS.refreshCartBadge();
    });
  }

  function removeItem(itemId) {
    fetch('/api/cart/' + itemId, { method: 'DELETE' }).then(() => {
      loadCart();
      if (window.USS) window.USS.refreshCartBadge();
    });
  }

  function wireItemEvents() {
    listEl.querySelectorAll('.cart-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.cart-item');
        const qtyEl = row.querySelector('.cart-item__qty-value');
        const newQty = parseInt(qtyEl.textContent, 10) + 1;
        updateQuantity(btn.getAttribute('data-item-id'), newQty);
      });
    });
    listEl.querySelectorAll('.cart-qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.cart-item');
        const qtyEl = row.querySelector('.cart-item__qty-value');
        const newQty = parseInt(qtyEl.textContent, 10) - 1;
        if (newQty < 1) {
          removeItem(btn.getAttribute('data-item-id'));
        } else {
          updateQuantity(btn.getAttribute('data-item-id'), newQty);
        }
      });
    });
    listEl.querySelectorAll('.cart-item__remove').forEach((btn) => {
      btn.addEventListener('click', () => removeItem(btn.getAttribute('data-item-id')));
    });
  }

  document.addEventListener('DOMContentLoaded', loadCart);
})();
