// =========================================================
//  session.js
//  Se incluye en TODAS las páginas. Se encarga de:
//   1. Consultar /api/auth/me para saber si hay sesión activa
//   2. Mostrar avatar + nombre + carrito (si hay sesión)
//      u ocultar esos elementos y mostrar "Iniciar sesión" /
//      "Registrarse" (si no hay sesión)
//   3. Conectar los formularios de login/registro del modal
//      con el backend real (Neon a través de la API)
//   4. Exponer window.USS.addToCart(product) para que otras
//      páginas (catálogo, descripción de libro) puedan
//      agregar productos al carrito real del usuario
// =========================================================

(function () {
  const AVATARS = [
    'assets/avatar-1.svg',
    'assets/avatar-2.svg',
    'assets/avatar-3.svg',
    'assets/avatar-4.svg',
  ];

  function avatarForEmail(email) {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
    }
    return AVATARS[hash % AVATARS.length];
  }

  function buildUserActionsMarkup(user) {
    const initials = (user.firstName || '?').charAt(0).toUpperCase();
    return `
      <button type="button" class="user-actions__cart" id="navCartBtn" aria-label="Ir al carrito" title="Carrito">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span class="user-actions__cart-badge" id="navCartBadge">0</span>
      </button>
      <button type="button" class="user-actions__profile" id="navProfileBtn" title="Mi cuenta">
        <img class="user-actions__avatar" id="navAvatarImg" src="${avatarForEmail(user.email)}" alt="${initials}">
        <span class="user-actions__name">${escapeHtml(user.firstName)}</span>
      </button>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function initNavbar(session) {
    const actionsContainers = document.querySelectorAll('.navbar__actions');
    actionsContainers.forEach((container) => {
      // Envolvemos los botones originales de "Iniciar sesión"/"Registrarse"
      // en un contenedor .guest-actions (si no lo estaban ya).
      let guestWrap = container.querySelector('.guest-actions');
      if (!guestWrap) {
        guestWrap = document.createElement('div');
        guestWrap.className = 'guest-actions';
        const originalButtons = Array.from(container.querySelectorAll('[data-auth-open]'));
        originalButtons.forEach((btn) => guestWrap.appendChild(btn));
        container.appendChild(guestWrap);
      }

      let userWrap = container.querySelector('.user-actions');
      if (!userWrap) {
        userWrap = document.createElement('div');
        userWrap.className = 'user-actions';
        container.appendChild(userWrap);
      }

      if (session.authenticated) {
        userWrap.innerHTML = buildUserActionsMarkup(session.user);
        container.setAttribute('data-session-state', 'authenticated');

        const cartBtn = userWrap.querySelector('#navCartBtn');
        if (cartBtn) {
          cartBtn.addEventListener('click', () => {
            window.location.href = 'carrito.html';
          });
        }

        const profileBtn = userWrap.querySelector('#navProfileBtn');
        if (profileBtn) {
          profileBtn.addEventListener('click', () => {
            if (window.USS && window.USS.openAccountPanel) {
              window.USS.openAccountPanel(session.user);
            } else if (window.confirm('¿Deseas cerrar sesión, ' + session.user.firstName + '?')) {
              logout();
            }
          });
        }
      } else {
        container.setAttribute('data-session-state', 'guest');
      }
    });

    if (session.authenticated) {
      refreshCartBadge();
    }
  }

  function refreshCartBadge() {
    fetch('/api/cart')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.ok) return;
        document.querySelectorAll('#navCartBadge').forEach((badge) => {
          badge.textContent = data.count;
          badge.classList.toggle('is-visible', data.count > 0);
        });
      })
      .catch(() => {});
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      window.location.href = 'inicio.html';
    });
  }

  var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function fieldWrap(input) {
    // El campo real de USS envuelve el <input> en .auth-modal__field
    return input.closest('.auth-modal__field') || input.parentElement;
  }

  function showFieldError(input, message) {
    var wrap = fieldWrap(input);
    if (!wrap) return;
    wrap.classList.add('auth-modal__field--error');
    var errorEl = wrap.querySelector('.auth-modal__field-error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'auth-modal__field-error';
      wrap.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  function clearFieldError(input) {
    var wrap = fieldWrap(input);
    if (!wrap) return;
    wrap.classList.remove('auth-modal__field--error');
    var errorEl = wrap.querySelector('.auth-modal__field-error');
    if (errorEl) errorEl.remove();
  }

  function clearAllFieldErrors(form) {
    form.querySelectorAll('.auth-modal__field--error').forEach(function (wrap) {
      wrap.classList.remove('auth-modal__field--error');
      var errorEl = wrap.querySelector('.auth-modal__field-error');
      if (errorEl) errorEl.remove();
    });
  }

  function showFormError(form, message) {
    let errorEl = form.querySelector('.auth-modal__error');
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.className = 'auth-modal__error';
      form.insertBefore(errorEl, form.firstChild);
    }
    errorEl.textContent = message;
  }

  function clearFormError(form) {
    const errorEl = form.querySelector('.auth-modal__error');
    if (errorEl) errorEl.remove();
  }

  function showFormSuccess(form, message) {
    clearFormError(form);
    let successEl = form.querySelector('.auth-modal__success');
    if (!successEl) {
      successEl = document.createElement('p');
      successEl.className = 'auth-modal__success';
      form.insertBefore(successEl, form.firstChild);
    }
    successEl.textContent = message;
  }

  // Valida un formulario de auth campo por campo. rules: [{ input, validators: [{ test, message }] }]
  // Cada validator.test(value) debe devolver true si es VÁLIDO. Se muestra el primer error encontrado por campo.
  function validateFields(rules) {
    var isValid = true;
    rules.forEach(function (rule) {
      if (!rule.input) return;
      clearFieldError(rule.input);
      var value = rule.input.value;
      for (var i = 0; i < rule.validators.length; i++) {
        var validator = rule.validators[i];
        if (!validator.test(value)) {
          showFieldError(rule.input, validator.message);
          isValid = false;
          break;
        }
      }
    });
    return isValid;
  }

  function wireAuthForms() {
    const loginForm = document.getElementById('authLoginForm');
    if (loginForm) {
      const loginEmailInput = document.getElementById('authLoginEmail');
      const loginPasswordInput = document.getElementById('authLoginPassword');

      // Limpia el error de un campo apenas la persona empieza a corregirlo.
      [loginEmailInput, loginPasswordInput].forEach(function (input) {
        if (input) input.addEventListener('input', function () { clearFieldError(input); });
      });

      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearFormError(loginForm);

        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;

        const isValid = validateFields([
          {
            input: loginEmailInput,
            validators: [
              { test: function (v) { return v.trim().length > 0; }, message: 'Ingresa tu correo electrónico.' },
              { test: function (v) { return EMAIL_REGEX.test(v.trim()); }, message: 'Ingresa un correo electrónico válido (ejemplo@correo.com).' },
            ],
          },
          {
            input: loginPasswordInput,
            validators: [
              { test: function (v) { return v.length > 0; }, message: 'Ingresa tu contraseña.' },
            ],
          },
        ]);
        if (!isValid) return;

        const submitBtn = loginForm.querySelector('.auth-modal__submit');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Ingresando...';

        fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
          .then((r) => r.json().then((data) => ({ status: r.status, data })))
          .then((res) => {
            if (res.data.ok) {
              showFormSuccess(loginForm, '¡Sesión iniciada correctamente! Redirigiendo...');
              submitBtn.disabled = true;
              setTimeout(() => window.location.reload(), 1200);
            } else {
              showFormError(loginForm, res.data.message || 'No se pudo iniciar sesión.');
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          })
          .catch(() => {
            showFormError(loginForm, 'Error de conexión con el servidor.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          });
      });
    }

    const registerForm = document.getElementById('authRegisterForm');
    if (registerForm) {
      const firstNameInput = document.getElementById('authRegisterFirstName');
      const lastNameInput = document.getElementById('authRegisterLastName');
      const emailField = document.getElementById('authRegisterEmail');
      const addressInput = document.getElementById('authRegisterAddress');
      const passwordInput = document.getElementById('authRegisterPassword');
      const confirmPasswordInput = document.getElementById('authRegisterConfirmPassword');
      const termsInput = document.getElementById('authRegisterTerms');

      [firstNameInput, lastNameInput, emailField, addressInput, passwordInput, confirmPasswordInput].forEach(function (input) {
        if (input) input.addEventListener('input', function () { clearFieldError(input); });
      });
      if (termsInput) termsInput.addEventListener('change', function () { clearFieldError(termsInput); });

      registerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        clearFormError(registerForm);

        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const email = emailField ? emailField.value.trim() : '';
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        const rules = [
          {
            input: firstNameInput,
            validators: [{ test: function (v) { return v.trim().length > 0; }, message: 'Ingresa tus nombres.' }],
          },
          {
            input: lastNameInput,
            validators: [{ test: function (v) { return v.trim().length > 0; }, message: 'Ingresa tus apellidos.' }],
          },
          {
            input: emailField,
            validators: [
              { test: function (v) { return v.trim().length > 0; }, message: 'Ingresa tu correo electrónico.' },
              { test: function (v) { return EMAIL_REGEX.test(v.trim()); }, message: 'Ingresa un correo electrónico válido (ejemplo@correo.com).' },
            ],
          },
          {
            input: addressInput,
            validators: [{ test: function (v) { return v.trim().length > 0; }, message: 'Ingresa tu dirección de residencia.' }],
          },
          {
            input: passwordInput,
            validators: [
              { test: function (v) { return v.length > 0; }, message: 'Crea una contraseña.' },
              { test: function (v) { return v.length >= 8; }, message: 'La contraseña debe tener al menos 8 caracteres.' },
              { test: function (v) { return /[A-Z]/.test(v); }, message: 'La contraseña debe incluir al menos una letra mayúscula.' },
              { test: function (v) { return /[0-9]/.test(v); }, message: 'La contraseña debe incluir al menos un número.' },
              { test: function (v) { return /[^A-Za-z0-9]/.test(v); }, message: 'La contraseña debe incluir al menos un símbolo.' },
            ],
          },
          {
            input: confirmPasswordInput,
            validators: [
              { test: function (v) { return v.length > 0; }, message: 'Repite tu contraseña.' },
              { test: function (v) { return v === passwordInput.value; }, message: 'Las contraseñas no coinciden.' },
            ],
          },
        ];

        let isValid = validateFields(rules);

        if (termsInput && !termsInput.checked) {
          showFormError(registerForm, 'Debes aceptar los Términos y condiciones y la Política de privacidad para continuar.');
          isValid = false;
        }

        if (!isValid) return;

        const submitBtn = registerForm.querySelector('.auth-modal__submit');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creando cuenta...';

        fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, password }),
        })
          .then((r) => r.json().then((data) => ({ status: r.status, data })))
          .then((res) => {
            if (res.data.ok) {
              showFormSuccess(registerForm, '¡Cuenta creada exitosamente! Iniciando sesión...');
              submitBtn.disabled = true;
              setTimeout(() => window.location.reload(), 1200);
            } else {
              showFormError(registerForm, res.data.message || 'No se pudo crear la cuenta.');
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          })
          .catch(() => {
            showFormError(registerForm, 'Error de conexión con el servidor.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          });
      });
    }
  }

  function fetchSession() {
    return fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => (data.ok ? data : { authenticated: false }))
      .catch(() => ({ authenticated: false }));
  }

  // API pública para que catalogo.html / descripcionLibro.html agreguen al carrito real
  window.USS = window.USS || {};
  window.USS.addToCart = function (product, quantity) {
    return fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.productId,
        name: product.name,
        author: product.author,
        price: product.price,
        image: product.image,
        quantity: quantity || 1,
      }),
    }).then((r) => r.json().then((data) => ({ status: r.status, data })));
  };
  window.USS.refreshCartBadge = refreshCartBadge;
  window.USS.getSession = fetchSession;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.navbar__actions').forEach((c) => c.setAttribute('data-session-state', 'loading'));
    wireAuthForms();
    fetchSession().then(initNavbar);
  });
})();
