// Debe ser IDÉNTICA a la función slugify() del frontend
// (public/assets/js/cart-actions.js), porque el carrito guarda
// cart_items.product_id / orders.items[].productId como el slug del
// título del libro (VARCHAR), NO como el id numérico de catalog_books.
//
// Antes, varias partes del panel de admin hacían Number(item.productId)
// para buscar el libro en catalog_books, lo cual siempre fallaba (el
// slug no es un número) y por eso el stock salía como "?" y el
// descuento de stock al marcar "Pedido pagado" nunca se aplicaba de
// verdad. Usando este mismo slugify() de aquí en el servidor, podemos
// encontrar el libro correcto a partir de su título.

function slugify(text) {
  return String(text || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
