# Sistema de contacto: formulario de QA.html + panel "Actualizar Contacto"

Este ZIP contiene **solo los archivos nuevos o modificados**. Cópialos
dentro de tu proyecto respetando las mismas rutas.

## Archivos nuevos

- **`server/routes/contact.routes.js`** — Toda la API de contacto:
  - `POST /api/contact` (público): guarda el mensaje del formulario de
    QA.html, envía confirmación al usuario y notifica al equipo.
  - `GET /api/contact/admin/messages` (protegido, sesión de `/admin`):
    lista todos los mensajes para la tabla del panel.
  - `POST /api/contact/admin/messages/:id/respond` (protegido): envía la
    respuesta real por correo al usuario y actualiza el estado.
  - `PATCH /api/contact/admin/messages/:id/status` (protegido): cambia el
    estado sin reenviar correo.
- **`server/views/contacto-dashboard.html`** — El panel nuevo, con el
  mismo diseño y la misma dinámica que "Usuarios y pedidos": tabla con
  semáforo de estado, botón "Responder" que abre un modal con **De /
  Para** (el "Para" queda fijo con el correo de quien contactó, no se
  puede editar), selector de estado y campo de mensaje.

## Archivos modificados

- **`server/config/brevo.js`** — Se agregaron 3 funciones de correo:
  `sendContactConfirmationEmail` (al usuario, confirmando que su mensaje
  llegó), `sendContactNotificationEmail` (al equipo, avisando que llegó un
  mensaje nuevo) y `sendContactResponseEmail` (al usuario, con la
  respuesta que el admin escribió desde el panel).
- **`server/config/migrate.js`** — Se agregó la tabla `contact_messages`
  (nombre, teléfono, correo, asunto, mensaje, estado, respuesta, quién
  respondió, fechas).
- **`server/server.js`** — Se montó `/api/contact` y se agregó la ruta
  protegida `/panel-contacto` (usa la **misma sesión que `/admin`**, no un
  login separado como catálogo o blog, tal como pediste).
- **`server/views/admin-dashboard.html`** — Se agregó el botón
  **"Actualizar Contacto"** en el panel lateral, junto a "Actualizar
  Catálogo" y "Actualizar Blog".
- **`public/QA.html`** — El formulario "Envíanos un Mensaje" ahora envía
  de verdad al backend (antes solo simulaba el envío visualmente).

## Cómo funciona el flujo completo

1. Un visitante llena el formulario de contacto en QA.html y lo envía.
2. El mensaje se guarda en la base de datos con estado **"Pendiente a
   responder"**.
3. Automáticamente se envían dos correos:
   - Al **visitante**: confirmando que su mensaje llegó a USS Sello
     Editorial.
   - Al equipo (por defecto **isabellacastrocamacho117@outlook.com**,
     configurable — ver abajo): notificando que hay un mensaje nuevo, con
     todos los datos del formulario.
4. Un admin entra a `/admin` (con su sesión normal) y hace clic en
   **"Actualizar Contacto"** en el panel lateral → lo lleva directo a
   `/panel-contacto` (sin pedir login de nuevo, porque usa la misma sesión
   de administrador).
5. Ahí ve la tabla de mensajes: nombre, correo, fecha de recepción,
   asunto/vista previa del mensaje, si ya se respondió y el estado con
   semáforo de colores (🔴 pendiente / 🟡 respondido / 🟢 resuelto).
6. Al hacer clic en el botón de estado (que funciona como "Responder"),
   se abre el modal con todo el detalle del mensaje de contacto: nombre,
   correo, teléfono, fecha y el mensaje completo.
7. El admin ve los campos **De** (fijo: fondoeditorial@uss.edu.pe) y
   **Para** (fijo: el correo del visitante que escribió, no editable),
   elige el estado (**Respondido** o **Resuelto**) y escribe la respuesta.
8. Al enviar, se manda un correo real al visitante con la respuesta, y el
   mensaje pasa a mostrar ese estado en la tabla.

## Variable de entorno opcional

Por defecto, el único correo que recibe notificaciones de contacto nuevo es:

```
isabellacastrocamacho117@outlook.com
```

Para agregar más correos en el futuro (tal como mencionaste), define en
Railway (o tu `.env`):

```
CONTACT_NOTIFY_EMAILS=correo1@ejemplo.com,correo2@ejemplo.com
```

Esto **solo** afecta quién recibe la notificación por correo de "mensaje
nuevo" — el panel `/panel-contacto` ya es visible para cualquier admin
autorizado en `ADMIN_EMAIL`, sin necesitar esta variable.

## Base de datos

No necesitas hacer nada manual: la tabla `contact_messages` se crea sola
la próxima vez que el servidor arranque (mismo mecanismo que las demás
tablas del proyecto).
