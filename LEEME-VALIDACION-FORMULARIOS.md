# Validación de formularios: texto rojo debajo del campo (sin alert())

Este ZIP contiene **solo los archivos modificados**. Reemplaza los tuyos por
estos, respetando las mismas rutas.

## Qué pediste

Que todos los formularios (login/registro de usuario, panel de catálogo,
panel de blog/reseña, QA.html, login del admin general) muestren los errores
de validación en **texto rojo debajo del campo correspondiente**, y que si
falta algún dato o el formato es incorrecto al darle al botón, se muestre
igual: texto rojo normal, **nunca** con `alert()` de JavaScript.

## Archivos modificados

1. **`public/assets/js/session.js`**
   Login y registro de usuario (el modal que aparece en las 11 páginas
   públicas: inicio, catálogo, blog, QA, carrito, etc.). Antes solo
   mostraba un mensaje general arriba del formulario; ahora valida
   **campo por campo** (correo con formato válido, contraseña no vacía,
   nombres/apellidos/dirección obligatorios, reglas de contraseña,
   confirmación de contraseña) y muestra el error en rojo justo debajo de
   cada input, además de limpiar el error apenas la persona empieza a
   corregirlo.

2. **`public/css/styles.css`**
   Se agregaron los estilos para `.auth-modal__field-error` (texto rojo
   debajo del campo) y se centralizaron `.auth-modal__error` /
   `.auth-modal__success` como clases CSS en vez de estilos inline en JS.

3. **`public/QA.html`**
   El formulario de contacto ("Envíanos un Mensaje") no tenía ninguna
   validación ni lógica de envío. Ahora valida cada campo (nombre,
   teléfono, correo, asunto, mensaje) con texto rojo debajo, y confirma el
   envío con un mensaje verde (no hay backend de contacto todavía, así que
   el "envío" es solo confirmación visual — como no me pediste crear ese
   backend, no lo inventé).

4. **`public/catalog-admin-login.html`** y **`public/blog-admin-login.html`**
   Ya tenían un mensaje general en rojo; ahora se agregó validación **por
   campo** (correo con formato válido, contraseña vacía, reglas de
   contraseña, confirmación de contraseña) con el texto de error debajo de
   cada input. El mensaje general se mantiene solo para respuestas del
   servidor que no corresponden a un campo específico (ej. "contraseña
   incorrecta" ahora aparece debajo del campo de contraseña).

5. **`public/admin-login.html`**
   Mismo tratamiento: validación de correo y de código de 6 dígitos por
   campo, en rojo debajo de cada uno.

6. **`public/procesarPago.html`**
   El botón "Pagar" usaba `alert()` si no se podía procesar el pago.
   Ahora: (a) valida que se haya seleccionado un método de pago antes de
   enviar, mostrando el error en texto rojo debajo del botón; y (b)
   cualquier error del servidor también se muestra ahí, nunca con
   `alert()`.

7. **`server/views/admin-dashboard.html`** y **`server/views/blog-dashboard.html`**
   Estos ya seguían el patrón de "texto rojo debajo del campo" en sus
   formularios principales (agregar/editar libro, agregar/editar reseña).
   Lo único que tenían eran 5 `alert()` sueltos en acciones de tabla
   (tomar un usuario ya atendido, ocultar/eliminar una reseña). No son
   errores de campo — son avisos de una acción de tabla — así que en vez
   de `alert()` ahora usan un aviso no bloqueante en la esquina superior
   derecha (mismo texto, mismo color rojo, pero no interrumpe con una
   ventana emergente del navegador).

## Confirmación

Se revisó **todo el proyecto** y ya no queda ningún `alert()` real en
ningún archivo — se buscó en todos los `.html` de `public/` y
`server/views/`. Todos los formularios usan ahora texto en rojo bajo el
campo correspondiente.
