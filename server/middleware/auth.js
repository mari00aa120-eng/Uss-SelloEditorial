// Middleware que exige que el usuario haya iniciado sesión (cliente normal).
function requireUser(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'Debes iniciar sesión para continuar.' });
}

// Middleware que exige que la sesión tenga el flag de administrador verificado
// (solo se activa tras pasar correo + código de un solo uso enviado por Brevo).
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.adminEmail) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'No autorizado.' });
}

// Middleware que exige que la sesión tenga el flag de administrador de
// CATÁLOGO verificado (correo + contraseña propios, distinto del panel
// /admin). Se usa para proteger el CRUD de catalog_books.
function requireCatalogAdmin(req, res, next) {
  if (req.session && req.session.isCatalogAdmin && req.session.catalogAdminEmail) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'No autorizado.' });
}

// Middleware que exige que la sesión tenga el flag de administrador de
// BLOG verificado (correo + contraseña propios, distinto de /admin y de
// /panel-catalogo). Se usa para proteger el CRUD de blog_reviews.
function requireBlogAdmin(req, res, next) {
  if (req.session && req.session.isBlogAdmin && req.session.blogAdminEmail) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'No autorizado.' });
}

module.exports = { requireUser, requireAdmin, requireCatalogAdmin, requireBlogAdmin };
