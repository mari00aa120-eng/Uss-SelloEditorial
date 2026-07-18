require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./config/db');
const { runMigrations } = require('./config/migrate');

const authRoutes = require('./routes/auth.routes');
const cartRoutes = require('./routes/cart.routes');
const adminRoutes = require('./routes/admin.routes');
const ordersRoutes = require('./routes/orders.routes');
const catalogRoutes = require('./routes/catalog.routes');
const blogRoutes = require('./routes/blog.routes');
const contactRoutes = require('./routes/contact.routes');
const permissionsRoutes = require('./routes/permissions.routes');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Railway está detrás de un proxy; esto permite que las cookies "secure" funcionen bien.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------ Sesiones (guardadas en Neon Postgres) ------------------
app.use(
  session({
    store: new pgSession({
      pool,
      tableName: 'session', // connect-pg-simple crea esta tabla automáticamente
      createTableIfMissing: true,
    }),
    name: 'uss.sid',
    secret: process.env.SESSION_SECRET || 'cambia_esto_en_produccion',
    resave: false,
    saveUninitialized: false,
    rolling: false, // sesión FIJA: expira a las 2 horas desde que se inició sesión, sin importar la actividad
    cookie: {
      httpOnly: true,
      secure: isProduction, // solo HTTPS en producción (Railway sirve HTTPS)
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 2, // 2 horas fijas -> luego de eso la sesión se cierra sola
    },
  })
);

// ------------------ Rutas de la API ------------------
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/permissions', permissionsRoutes);

// ------------------ Panel de administración (protegido) ------------------
// El HTML del dashboard vive FUERA de /public para que nadie pueda acceder
// directamente a él sin pasar antes por la verificación de sesión de admin.
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin && req.session.adminEmail) {
    return res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
  }
  return res.redirect('/admin-login.html');
});

// ------------------ Panel de actualización de catálogo (protegido) ------------------
// Acceso SEPARADO del panel /admin: usa su propia sesión (isCatalogAdmin) y
// su propio login por correo + contraseña (catalog-admin-login.html).
app.get('/panel-catalogo', (req, res) => {
  if (req.session && req.session.isCatalogAdmin && req.session.catalogAdminEmail) {
    return res.sendFile(path.join(__dirname, 'views', 'catalog-dashboard.html'));
  }
  return res.redirect('/catalog-admin-login.html');
});

// ------------------ Panel de gestión del Blog / Reseñas (protegido) ------------------
// Acceso SEPARADO de /admin y de /panel-catalogo: usa su propia sesión
// (isBlogAdmin) y su propio login por correo + contraseña (blog-admin-login.html).
app.get('/panel-blog', (req, res) => {
  if (req.session && req.session.isBlogAdmin && req.session.blogAdminEmail) {
    return res.sendFile(path.join(__dirname, 'views', 'blog-dashboard.html'));
  }
  return res.redirect('/blog-admin-login.html');
});

// ------------------ Panel de mensajes de contacto (protegido) ------------------
// Usa la MISMA sesión que /admin (isAdmin), ya que es parte del dashboard
// general de administración, no un panel separado como catálogo o blog.
app.get('/panel-contacto', (req, res) => {
  if (req.session && req.session.isAdmin && req.session.adminEmail) {
    return res.sendFile(path.join(__dirname, 'views', 'contacto-dashboard.html'));
  }
  return res.redirect('/admin-login.html');
});

// ------------------ Página raíz ------------------
// Como el proyecto no tiene "index.html" sino "inicio.html", redirigimos
// la raíz "/" hacia la página de inicio para que Railway no muestre
// "Cannot GET /" cuando alguien entra solo con el dominio.
app.get('/', (req, res) => {
  res.redirect('/inicio.html');
});

// ------------------ Frontend estático (landing, catálogo, carrito, etc.) ------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback simple para rutas no encontradas de la API
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'Endpoint no encontrado.' });
});

const PORT = process.env.PORT || 3000;
runMigrations()
  .catch((err) => {
    console.error('[migrate] Error creando/verificando tablas:', err.message);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`USS Sello Editorial escuchando en el puerto ${PORT} (${isProduction ? 'producción' : 'desarrollo'})`);
    });
  });
