# Filtros del catálogo funcionales + Publicaciones Destacadas dinámicas

Este ZIP contiene **solo los archivos modificados**. Reemplaza los tuyos por
estos, respetando las mismas rutas.

## 1. `public/catalogo.html` — Filtro lateral 100% funcional

Todo el sidebar "Filtrar Por" ahora se genera con los datos **reales** de
los libros ya publicados en `/panel-catalogo` (antes tenía números
inventados como "Derecho 120", "Rivera Lozada 12", etc.):

- **Categorías**: se listan solo las categorías que existen en tus libros,
  con su conteo real. Si hay más de 5, aparece "Ver más" / "Ver menos".
- **Formato**: cuenta cuántos libros hay. ⚠️ **Ojo con esto**: tu modelo de
  libro actual no tiene un campo de "físico" vs. "digital" — solo existe
  el campo de tapa (Dura/Blanda) para libros físicos. Mientras ese campo
  no exista en el formulario del panel de catálogo, conté **todos los
  libros como "físico"** para que el filtro funcione con datos reales y no
  quede roto ni con números falsos. En cuanto agregues un campo tipo
  "¿Es libro digital?" al formulario de `/panel-catalogo`, dímelo y
  conecto el filtro a ese campo real.
- **Rango de Precio**: el slider ahora va de S/ 0 hasta el precio más alto
  que exista entre tus libros publicados (no un tope fijo de S/ 200).
- **Autor**: lista todos los autores reales con su conteo, buscador
  funcional, y "Más autores" si hay más de 4.
- **Características**: cuenta cuántos libros tienen tapa "Dura" y cuántos
  "Blanda", según el campo que ya llenas en el panel de catálogo.
- **Limpiar Filtros**: quita todo lo seleccionado y vuelve a mostrar el
  catálogo completo.
- Todos los filtros se combinan entre sí (por ejemplo: categoría
  "Derecho" + autor "Barturen Mondragón" + precio máximo S/ 50 a la vez).
- La paginación (6 libros por página) ahora pagina sobre los resultados
  **filtrados**, no sobre el catálogo completo.

El botón **"Contactar"** del bloque "¿No encuentras lo que buscas?" ahora
lleva directo a `QA.html#contactanos` (antes no hacía nada).

## 2. `public/inicio.html` — Publicaciones Destacadas dinámicas

Antes las 4 tarjetas de "Publicaciones Destacadas" eran fijas (Sipán,
Manual de citado, etc., siempre las mismas). Ahora:

- Se cargan libros reales desde `/panel-catalogo`.
- Se muestran **hasta 4**, pero si hay menos publicados se muestran solo
  esos (ej. si solo tienes 1 libro en el catálogo, en inicio.html aparece
  solo 1; si tienes 16, se muestran 4).
- Se priorizan los libros que tengan descuento activo (son los que tiene
  sentido "destacar" con el badge de %), y si no hay suficientes con
  descuento se completa con el resto en el orden del catálogo.
- El botón "Añadir al carrito" ahora funciona de verdad (antes no hacía
  nada en esta sección — solo funcionaba en `catalogo.html`).

## 3. `public/assets/js/cart-actions.js`

Se extendió el listener de "Añadir al carrito" para que también reconozca
las tarjetas de `inicio.html` (antes solo escuchaba las de
`catalogo.html`). Es el mismo archivo que usan ambas páginas, así que el
cambio se aplica automáticamente a las dos.

## Nada de esto tocó el backend

Todo se resolvió consumiendo el endpoint público que ya existía
(`GET /api/catalog/books`), que ya devuelve categoría, autores, precio,
tipo de tapa e imagen de cada libro. No fue necesario modificar
`catalog.routes.js` ni la base de datos.
