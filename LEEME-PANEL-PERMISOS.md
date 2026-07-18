# Panel de Permisos: gestionar quién entra a Admin, Catálogo y Blog

Este ZIP contiene **solo los archivos nuevos o modificados**. Cópialos
dentro de tu proyecto respetando las mismas rutas.

⚠️ **Nada de esto borra tus libros ni ningún otro dato ya guardado.** Todo
lo que hace este cambio es: crear una tabla nueva (`permitted_users`) y
ajustar cómo se valida el acceso a los paneles. Tus 12 libros, tus
reseñas, tus mensajes de contacto — nada de eso se toca.

## Qué pediste

Un panel "Permisos" en el sidebar de `/admin`, con una tabla de correos
que tienen acceso a Admin/Catálogo/Blog, y un botón "Nuevo" que abre un
formulario (nombre, apellido, correo, y checkboxes de qué accesos dar) que
al guardar otorga esos permisos automáticamente.

## Cómo quedó

1. En el sidebar de `/admin` aparece un nuevo botón **"Permisos"**, al
   mismo nivel que Dashboard / Usuarios y pedidos / Actualizar Catálogo /
   Actualizar Blog / Actualizar Contacto.
2. Al hacer clic, se abre una vista con:
   - 3 tarjetas de resumen (cuántos correos tienen acceso a cada panel).
   - Una tabla: **Nombre completo, Correo, Admin (Sí/No), Catálogo
     (Sí/No), Blog (Sí/No), Acciones**.
   - Botones "Editar" y "Quitar" por cada fila.
3. El botón **"+ Nuevo"** abre un formulario con:
   - Nombres
   - Apellidos
   - Correo electrónico
   - Tipo de permiso: 3 casillas independientes — **Entrar a Admin**,
     **Actualizar Catálogo**, **Actualizar Blog** — se puede marcar una,
     varias, o las 3 a la vez.
4. Al guardar, el correo queda **inmediatamente autorizado** para entrar a
   los paneles marcados: puede pedir su código de acceso a `/admin` (si se
   marcó "Entrar a Admin") o crear su contraseña en
   `catalog-admin-login.html` / `blog-admin-login.html` (si se marcaron
   esos permisos) — exactamente el mismo flujo que ya usa Isabella hoy.
5. Al editar un permiso existente, el correo no se puede cambiar (por
   diseño: si alguien cambia de correo, es más seguro quitar el permiso
   viejo y crear uno nuevo). Sí se pueden cambiar nombre, apellido y qué
   accesos tiene.
6. Al "Quitar" un permiso, la persona pierde el acceso a todos los paneles
   de inmediato — pero **si ya había iniciado sesión antes**, su sesión
   activa en el navegador no se cierra automáticamente (tendría que cerrar
   sesión o que expire); lo que sí se bloquea es cualquier intento de
   volver a entrar.

## Cambios técnicos (por si te preguntas por qué se tocaron tantos archivos)

Antes de este cambio, el acceso a los 3 paneles se decidía así:

- **Admin**: variable de entorno `ADMIN_EMAIL` en Railway.
- **Catálogo**: variable de entorno `CATALOG_ADMIN_EMAILS`.
- **Blog**: variable de entorno `BLOG_ADMIN_EMAILS`.

Cada uno vivía en un lugar distinto y solo tú (o quien tenga acceso a
Railway) podía cambiarlas — no había forma de gestionarlo desde el panel
web. Para que "Permisos" funcione de verdad (que dar/quitar acceso se
refleje al instante sin tocar Railway), estos 3 sistemas ahora leen
primero de la tabla `permitted_users`, y las variables de entorno se
mantienen como respaldo por si las sigues usando (no es necesario que las
borres de Railway; simplemente ya no son la única fuente).

Archivos modificados por esto:

- **`server/config/migrate.js`** — nueva tabla `permitted_users`
  (nombres, apellido, correo, y 3 columnas booleanas: puede entrar a
  admin / catálogo / blog). Se siembra automáticamente con Isabella
  (`isabellacastrocamacho117@outlook.com`) con acceso completo a los 3, la
  primera vez que arranque el servidor con esta tabla vacía.
- **`server/routes/permissions.routes.js`** (nuevo) — toda la API:
  listar, crear, editar, eliminar permisos. Protegido con sesión de admin
  (`requireAdmin`), igual que "Usuarios y pedidos".
- **`server/routes/admin.routes.js`** — el login de `/admin` (pedir
  código, verificar código) ahora también acepta correos que estén
  marcados con "Entrar a Admin" en la tabla de Permisos, además de los que
  sigan en `ADMIN_EMAIL`.
- **`server/routes/catalog.routes.js`** y **`server/routes/blog.routes.js`**
  — mismo ajuste: el login de esos paneles ahora reconoce los correos que
  el panel de Permisos autorizó, no solo los de la variable de entorno.
- **`server/server.js`** — se montó `/api/permissions`.
- **`server/views/admin-dashboard.html`** — la vista nueva de Permisos
  (tabla + modal "Nuevo/Editar"), agregada al mismo sistema de pestañas
  que ya usan "Dashboard" y "Usuarios y pedidos".

## De paso

Aproveché para terminar de aplicar la limpieza de emojis que habíamos
acordado antes (sidebar de `/admin`, iconos de las tarjetas KPI, y el
botón "Ver dashboard" de catálogo/blog) — al parecer el ZIP que subiste no
tenía esos cambios todavía, así que los incluí aquí para que quede todo al
día.

## Correo autorizado por defecto

Como pediste, por ahora el único correo con permisos es:

```
isabellacastrocamacho117@outlook.com
```

Con acceso completo a los 3 paneles (Admin, Catálogo, Blog). Desde ahora,
cualquier correo nuevo que quieras autorizar se agrega directamente desde
"Permisos" en `/admin` — ya no hace falta tocar Railway.
