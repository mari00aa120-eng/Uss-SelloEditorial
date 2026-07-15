// =========================================================
//  account-panel.js
//  Panel lateral que se abre al hacer clic en el avatar del
//  navbar. Incluye:
//   - Botón "Cerrar sesión" -> abre un modal de confirmación
//     (fondo blanco, igual estilo que el modal de login)
//   - Botón "Ver mis productos" -> abre un modal con las
//     facturas/pedidos que el usuario ya generó
//  Requiere que session.js se haya cargado antes.
// =========================================================

(function () {
  let injected = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatSoles(value) {
    return 'S/ ' + Number(value).toFixed(2);
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function injectMarkup() {
    if (injected) return;
    injected = true;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <!-- Drawer lateral de cuenta -->
      <div class="account-drawer-overlay" id="accountDrawerOverlay">
        <div class="account-drawer" role="dialog" aria-modal="true" aria-labelledby="accountDrawerName">
          <button type="button" class="account-drawer__close" id="accountDrawerClose" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="account-drawer__header">
            <img class="account-drawer__avatar" id="accountDrawerAvatar" src="" alt="">
            <div>
              <div class="account-drawer__name" id="accountDrawerName"></div>
              <div class="account-drawer__email" id="accountDrawerEmail"></div>
            </div>
          </div>
          <div class="account-drawer__menu">
            <button type="button" class="account-drawer__menu-item" id="accountMenuOrders">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 8V21H3V8"/>
                <path d="M1 3h22v5H1z"/>
                <path d="M10 12h4"/>
              </svg>
              Ver mis productos
            </button>
            <button type="button" class="account-drawer__menu-item account-drawer__menu-item--danger" id="accountMenuLogout">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <!-- Modal de confirmación para cerrar sesión -->
      <div class="account-modal-overlay" id="accountLogoutConfirmOverlay">
        <div class="account-modal" role="dialog" aria-modal="true">
          <h3>¿Cerrar sesión?</h3>
          <p>¿Estás seguro de que deseas cerrar tu sesión actual?</p>
          <div class="account-modal__actions">
            <button type="button" class="btn btn--outline" id="accountLogoutCancel">Cancelar</button>
            <button type="button" class="btn btn--primary" id="accountLogoutConfirm">Sí, cerrar sesión</button>
          </div>
        </div>
      </div>

      <!-- Modal "Mis productos" -->
      <div class="account-modal-overlay" id="accountOrdersOverlay">
        <div class="account-modal account-orders-modal" role="dialog" aria-modal="true">
          <div class="account-orders-modal__header">
            <h3>Mis productos</h3>
            <button type="button" class="account-orders-modal__close" id="accountOrdersClose" aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="account-orders-list" id="accountOrdersList">
            <p style="text-align:center; color:#777;">Cargando...</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    wireEvents();
  }

  function openDrawer() {
    document.getElementById('accountDrawerOverlay').classList.add('is-open');
  }

  function closeDrawer() {
    document.getElementById('accountDrawerOverlay').classList.remove('is-open');
  }

  function openLogoutConfirm() {
    closeDrawer();
    document.getElementById('accountLogoutConfirmOverlay').classList.add('is-open');
  }

  function closeLogoutConfirm() {
    document.getElementById('accountLogoutConfirmOverlay').classList.remove('is-open');
  }

  function openOrdersModal() {
    closeDrawer();
    const overlay = document.getElementById('accountOrdersOverlay');
    overlay.classList.add('is-open');
    loadOrders();
  }

  function closeOrdersModal() {
    document.getElementById('accountOrdersOverlay').classList.remove('is-open');
  }

  function renderOrderInvoiceHtml(order) {
    const rows = order.items
      .map(
        (item) => `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${formatSoles(item.price)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right;">${formatSoles(item.subtotal)}</td>
      </tr>`
      )
      .join('');

    return `
      <html>
        <head>
          <title>Factura ${escapeHtml(order.invoiceNumber)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #1a1a1a; font-size: 13px; }
            .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 16px; }
          </style>
        </head>
        <body>
          <h1>USS Sello Editorial</h1>
          <p>Factura electrónica: <strong>${escapeHtml(order.invoiceNumber)}</strong></p>
          <p>Fecha: ${formatDate(order.createdAt)}</p>
          <table>
            <thead>
              <tr><th>Producto</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="total">Total: ${formatSoles(order.total)}</p>
        </body>
      </html>
    `;
  }

  function downloadInvoice(order) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(renderOrderInvoiceHtml(order));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }

  function loadOrders() {
    const listEl = document.getElementById('accountOrdersList');
    listEl.innerHTML = '<p style="text-align:center; color:#777;">Cargando...</p>';

    fetch('/api/orders')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          listEl.innerHTML = '<p style="text-align:center; color:#c0392b;">No se pudo cargar tus productos.</p>';
          return;
        }
        if (data.orders.length === 0) {
          listEl.innerHTML =
            '<div class="account-orders-empty">Aún no has generado ninguna factura.<br>Cuando compres un libro y confirmes el pago, aparecerá aquí.</div>';
          return;
        }
        listEl.innerHTML = data.orders
          .map((order) => {
            const itemsHtml = order.items
              .map((item) => `<li>${escapeHtml(item.name)} × ${item.quantity}</li>`)
              .join('');
            return `
            <div class="account-order-card">
              <div class="account-order-card__top">
                <span class="account-order-card__invoice">${escapeHtml(order.invoiceNumber)}</span>
                <span class="account-order-card__date">${formatDate(order.createdAt)}</span>
              </div>
              <ul class="account-order-card__items">${itemsHtml}</ul>
              <div class="account-order-card__bottom">
                <span class="account-order-card__total">${formatSoles(order.total)}</span>
                <button type="button" class="account-order-card__download" data-order-id="${order.id}">Descargar factura</button>
              </div>
            </div>`;
          })
          .join('');

        listEl.querySelectorAll('.account-order-card__download').forEach((btn) => {
          btn.addEventListener('click', () => {
            const order = data.orders.find((o) => String(o.id) === btn.getAttribute('data-order-id'));
            if (order) downloadInvoice(order);
          });
        });
      })
      .catch(() => {
        listEl.innerHTML = '<p style="text-align:center; color:#c0392b;">Error de conexión con el servidor.</p>';
      });
  }

  function wireEvents() {
    document.getElementById('accountDrawerClose').addEventListener('click', closeDrawer);
    document.getElementById('accountDrawerOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'accountDrawerOverlay') closeDrawer();
    });

    document.getElementById('accountMenuLogout').addEventListener('click', openLogoutConfirm);
    document.getElementById('accountMenuOrders').addEventListener('click', openOrdersModal);

    document.getElementById('accountLogoutCancel').addEventListener('click', closeLogoutConfirm);
    document.getElementById('accountLogoutConfirmOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'accountLogoutConfirmOverlay') closeLogoutConfirm();
    });
    document.getElementById('accountLogoutConfirm').addEventListener('click', () => {
      fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
        window.location.href = 'inicio.html';
      });
    });

    document.getElementById('accountOrdersClose').addEventListener('click', closeOrdersModal);
    document.getElementById('accountOrdersOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'accountOrdersOverlay') closeOrdersModal();
    });
  }

  // API pública: session.js llama a esto cuando se hace clic en el avatar del navbar
  window.USS = window.USS || {};
  window.USS.openAccountPanel = function (user) {
    injectMarkup();

    document.getElementById('accountDrawerName').textContent = user.firstName + ' ' + user.lastName;
    document.getElementById('accountDrawerEmail').textContent = user.email;
    const avatarImg = document.getElementById('navAvatarImg');
    document.getElementById('accountDrawerAvatar').src = avatarImg ? avatarImg.src : '';

    openDrawer();
  };
})();
