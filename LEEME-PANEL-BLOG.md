# Cambios del Panel de Blog (reseñas) — instrucciones de instalación

Este ZIP contiene **solo** los archivos nuevos o modificados. Cópialos dentro
de tu proyecto `uss-landing`, respetando las mismas rutas/carpetas.

## 1. Archivo que debes ELIMINAR de tu proyecto

- `public/resenaSipan.html`
  → Reemplazado por `public/resena.html`, que ahora es genérico y funciona
    para cualquier reseña vía `resena.html?id=ID` (antes solo servía para
    el libro de Sipán).

## 2. Archivos NUEVOS

- `server/routes/blog.routes.js` — Toda la API del blog: login/registro del
  panel, CRUD de reseñas, comentarios (con respuestas) y calificaciones por
  estrellas (del libro y de cada comentario).
- `server/views/blog-dashboard.html` — Panel de gestión de reseñas
  (`/panel-blog`): listado en tabla + formulario con selector de libro del
  catálogo, imagen de testimonio (URL o subida de archivo), fotos de cada
  autor, cita destacada, palabras clave, etc.
- `public/blog-admin-login.html` — Login separado del panel de blog (correo +
  contraseña propios, igual que el panel de catálogo).
- `public/resena.html` — Página pública de detalle de reseña, genérica
  (antes `resenaSipan.html`, ahora reutilizable para cualquier libro).
- `public/assets/blog/` — Carpeta donde se guardan las imágenes subidas
  desde el panel de blog (testimonio y fotos de autores).

## 3. Archivos MODIFICADOS (reemplaza los tuyos por estos)

- `server/server.js` — Se agregó el montaje de `/api/blog` y la ruta
  protegida `/panel-blog`.
- `server/config/migrate.js` — Se agregaron las tablas nuevas:
  `blog_admins`, `blog_reviews`, `blog_review_comments`,
  `blog_review_ratings`, `blog_comment_ratings`.
- `server/middleware/auth.js` — Se agregó `requireBlogAdmin`.
- `server/views/admin-dashboard.html` — Se agregó el botón **"Actualizar
  Blog"** en el panel lateral (junto a "Actualizar Catálogo"), que lleva a
  `/blog-admin-login.html`.
- `public/Blog.html` — Ahora es 100% dinámico:
  - El carrusel superior muestra las 4 reseñas más recientes.
  - "Autores de la semana" y "Libros del año" se generan al azar según el
    catálogo actual.
  - La grilla "Conoce el proceso..." pagina de verdad (9 reseñas por
    página) contra la base de datos.

## 4. Variables de entorno

Por defecto, el único correo autorizado para el panel de blog es:

```
isabellacastrocamacho117@outlook.com
```

Si quieres agregar más correos autorizados, define en Railway (o tu `.env`)
la variable:

```
BLOG_ADMIN_EMAILS=correo1@ejemplo.com,correo2@ejemplo.com
```

(Es exactamente el mismo patrón que ya usas con `CATALOG_ADMIN_EMAILS` para
el panel de catálogo.)

## 5. Cómo funciona el flujo completo

1. Entras a `/admin` con tu sesión normal de administrador.
2. En el panel lateral, click en **"Actualizar Blog"** → te lleva a
   `/blog-admin-login.html`.
3. Con el correo autorizado, creas tu contraseña (primera vez) o inicias
   sesión → te lleva a `/panel-blog`.
4. En `/panel-blog` ves la lista de reseñas ya publicadas (tabla con
   calificación, comentarios, estado activo/oculto). Puedes:
   - **Editar** cualquier reseña.
   - **Ocultar/Activar** sin borrarla (deja de mostrarse en el sitio
     público pero no se pierde).
   - **Eliminar** definitivamente.
5. Al crear una reseña nueva:
   - Eliges el libro desde el catálogo (buscador incluido). Al elegirlo,
     título y autores se autocompletan (editables).
   - Completas: categoría, país, imagen de testimonio, texto de la reseña,
     cita destacada, palabras clave, mensaje de invitación del autor a
     opinar, y las tarjetas de "Sobre los Autores" (foto + nombre +
     descripción, una por cada autor).
   - Al guardar, la reseña queda publicada de inmediato.
6. La reseña se ve en `resena.html?id=ID`, con exactamente la misma
   estructura visual que tenía `resenaSipan.html` (testimonio, estrellas,
   artículo, cita, palabras clave, invitación del autor, "Sobre los
   Autores", tarjeta "Ver Libro", Recomendaciones aleatorias y sección de
   comentarios/respuestas — esta última sigue siendo 100% pública: cualquier
   visitante, con o sin sesión, puede comentar, responder y calificar con
   estrellas).
7. En `Blog.html`:
   - El carrusel de arriba siempre muestra las 4 reseñas más recientes.
   - La grilla inferior muestra TODAS las reseñas, 9 por página, con
     paginación numerada real (si hay más de 9 reseñas, aparece la página 2,
     luego la 3, etc. — igual que pediste).
   - "Autores de la semana" y "Libros del año" se arman a partir del
     catálogo de libros actual.

## 6. Base de datos

No necesitas hacer nada manual: la próxima vez que el servidor arranque,
`server/config/migrate.js` crea automáticamente las tablas nuevas si no
existen (mismo mecanismo que ya usas para el catálogo).
