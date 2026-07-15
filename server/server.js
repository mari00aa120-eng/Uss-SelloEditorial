require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const cartRoutes = require('./routes/cart.routes');
const adminRoutes = require('./routes/admin.routes');

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
    cookie: {
      httpOnly: true,
      secure: isProduction, // solo HTTPS en producción (Railway sirve HTTPS)
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    },
  })
);

// ------------------ Rutas de la API ------------------
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/admin', adminRoutes);

// ------------------ Panel de administración (protegido) ------------------
// El HTML del dashboard vive FUERA de /public para que nadie pueda acceder
// directamente a él sin pasar antes por la verificación de sesión de admin.
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin && req.session.adminEmail) {
    return res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
  }
  return res.redirect('/admin-login.html');
});

// ------------------ Frontend estático (landing, catálogo, carrito, etc.) ------------------
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback simple para rutas no encontradas de la API
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'Endpoint no encontrado.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`USS Sello Editorial escuchando en el puerto ${PORT} (${isProduction ? 'producción' : 'desarrollo'})`);
});
