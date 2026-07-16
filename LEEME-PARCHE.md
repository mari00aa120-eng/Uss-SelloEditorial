# Parche: Panel de actualización de catálogo (`/panel-catalogo`)

Este ZIP contiene **solo** los archivos nuevos o modificados para agregar el panel lateral
izquierdo de actualización de catálogo, separado del panel `/admin`. Cópialos dentro de tu
proyecto `uss-landing`, respetando exactamente estas rutas (ya vienen en las carpetas correctas
dentro de este ZIP, así que puedes simplemente arrastrar/sobrescribir):

```
uss-landing/
├── README.md                              (MODIFICADO - se agregó sección del nuevo panel)
├── public/
│   ├── catalogo.html                      (MODIFICADO - ahora carga libros dinámicamente)
│   ├── descripcionLibro.html              (MODIFICADO - ahora carga el libro por ?id=)
│   └── catalog-admin-login.html           (NUEVO - login con correo + contraseña)
└── server/
    ├── server.js                          (MODIFICADO - nueva ruta /panel-catalogo y /api/catalog)
    ├── config/
    │   └── migrate.js                     (MODIFICADO - nuevas tablas catalog_admins y catalog_books)
    ├── middleware/
    │   └── auth.js                        (MODIFICADO - nuevo requireCatalogAdmin)
    ├── routes/
    │   └── catalog.routes.js              (NUEVO - toda la API del panel de catálogo)
    └── views/
        └── catalog-dashboard.html         (NUEVO - el panel con sidebar izquierdo)
```

## Qué hace este parche

1. **Nuevo tipo de acceso, separado de `/admin`**: se agregó la tabla `catalog_admins` y el flag
   de sesión `isCatalogAdmin` (distinto de `isAdmin`). Por ahora solo
   `isabellacastrocamacho117@outlook.com` está autorizado (variable `CATALOG_ADMIN_EMAILS`).
   Aunque es el mismo correo que ya usa `/admin`, es una autorización completamente aparte: entrar
   a uno no da acceso al otro.

2. **Crear contraseña / iniciar sesión** (`public/catalog-admin-login.html`): la primera vez que
   el correo autorizado entra, el sistema le pide crear una contraseña (con las mismas reglas de
   fortaleza que ya usa el registro de usuarios: 8+ caracteres, mayúscula, número y símbolo). Las
   siguientes veces, le pide directamente la contraseña.

3. **Panel con sidebar izquierdo** (`server/views/catalog-dashboard.html`, servido en
   `/panel-catalogo` y protegido por sesión): formulario completo para añadir/editar libros con:
   - Imagen (URL o nombre de archivo en `/public/assets/`)
   - Título
   - Autores (se agregan uno por uno con botón "+ Añadir autor")
   - Precio regular
   - Interruptor "¿Tiene descuento?" + porcentaje (si está apagado, no se guarda ningún descuento)
   - Reseña (texto libre, se refleja en `descripcionLibro.html`)
   - ISBN, Editorial, Tapa, Tamaño, Año de publicación, Páginas, Edición, Categoría, Idioma
   - Etiquetas (se agregan con botón "Añadir etiqueta", se muestran como chips removibles)
   - Interruptor de visibilidad (ocultar sin borrar)

   A la derecha del sidebar se ve la grilla con todos los libros ya guardados, con botones para
   Editar / Ocultar-Mostrar / Eliminar, y estadísticas de cuántos libros activos hay y cuántas
   páginas de catálogo eso habilita.

4. **`catalogo.html` ahora es 100% dinámico**: en vez de las tarjetas fijas que había antes, hace
   `fetch('/api/catalog/books')` y las renderiza. Pagina de 6 en 6: con 1-6 libros solo hay página
   1, con 7-12 aparece la página 2, con 13-18 la página 3, etc. — se calcula solo, no hay que
   configurar nada.

5. **`descripcionLibro.html` ahora es dinámico según `?id=`**: lee el parámetro de la URL (los
   links del catálogo ya apuntan a `descripcionLibro.html?id=X`), hace
   `fetch('/api/catalog/books/X')` y llena título, autores, imagen, precio, reseña y detalles.
   **Si el libro no tiene descuento activado, no se muestra**: el badge de "%", el precio tachado,
   la línea "Ahorras S/...", ni las tres cajas de "X% de descuento / Ahorra S/... / Promoción
   válida hasta agotar stock". Todo eso solo aparece si el libro sí tiene descuento.

## Variables de entorno

No necesitas agregar nada obligatoriamente: si no defines `CATALOG_ADMIN_EMAILS`, el sistema usa
por defecto `isabellacastrocamacho117@outlook.com`. Si más adelante quieres autorizar más correos
al panel de catálogo (sin darles acceso a `/admin`), agrega en tu `.env` (y en Railway):

```
CATALOG_ADMIN_EMAILS=isabellacastrocamacho117@outlook.com,otro-correo@ejemplo.com
```

## Base de datos

No necesitas correr nada a mano: al iniciar el servidor (`npm start` / `node server/server.js`),
`runMigrations()` crea automáticamente las tablas `catalog_admins` y `catalog_books` si no
existen (mismo patrón `IF NOT EXISTS` que ya usa el resto del proyecto).

## Rutas nuevas

- `GET /panel-catalogo` — vista protegida del panel (redirige a login si no hay sesión)
- `GET /catalog-admin-login.html` — login del panel (público)
- `GET /api/catalog/books` — público, lista de libros activos (los consume `catalogo.html`)
- `GET /api/catalog/books/:id` — público, detalle de un libro (lo consume `descripcionLibro.html`)
- `GET /api/catalog/auth/status?email=...` — saber si un correo ya tiene contraseña creada
- `POST /api/catalog/auth/create-password` — crear contraseña (solo correos autorizados)
- `POST /api/catalog/auth/login` — iniciar sesión
- `GET /api/catalog/auth/session` — saber si la sesión actual está autenticada
- `POST /api/catalog/auth/logout` — cerrar sesión
- `GET /api/catalog/admin/books` — protegido, lista TODOS los libros (activos e inactivos)
- `POST /api/catalog/admin/books` — protegido, crear libro
- `PUT /api/catalog/admin/books/:id` — protegido, editar libro
- `DELETE /api/catalog/admin/books/:id` — protegido, eliminar libro definitivamente
- `PATCH /api/catalog/admin/books/:id/toggle` — protegido, ocultar/mostrar libro
