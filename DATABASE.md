# Base de datos (Neon / PostgreSQL)

Este proyecto usa **Neon** (PostgreSQL serverless) como base de datos. Abajo está todo el código SQL necesario para crear las tablas. La tabla `session` es opcional crearla a mano porque `connect-pg-simple` la crea sola la primera vez que arranca el servidor (gracias a `createTableIfMissing: true`), pero se incluye aquí por si prefieres crearla manualmente o para tener el esquema completo documentado.

## Cómo ejecutar este script

1. Entra a tu proyecto en [neon.tech](https://neon.tech)
2. Ve a la pestaña **"SQL Editor"** (editor SQL) en el panel izquierdo
3. Copia y pega todo el bloque de código SQL de abajo
4. Presiona **"Run"** / **"Ejecutar"**

```sql
-- =========================================================
--  TABLA: users
--  Guarda las cuentas de los clientes que se registran
--  en la tienda (usadas para iniciar sesión y usar el carrito)
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);


-- =========================================================
--  TABLA: cart_items
--  Cada fila es un producto dentro del carrito de un usuario.
--  Si el mismo producto se agrega dos veces, se incrementa
--  la cantidad en lugar de crear una fila duplicada
--  (ver restricción UNIQUE (user_id, product_id)).
-- =========================================================
CREATE TABLE IF NOT EXISTS cart_items (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      VARCHAR(255) NOT NULL,   -- identificador/slug del libro
    product_name    VARCHAR(255) NOT NULL,
    product_author  VARCHAR(255),
    product_price   NUMERIC(10, 2) NOT NULL,
    product_image   TEXT,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user ON cart_items (user_id);


-- =========================================================
--  TABLA: admin_auth_codes
--  Guarda (con hash, nunca en texto plano) los códigos de un
--  solo uso que se envían por correo (Brevo) para entrar al
--  dashboard de administración.
-- =========================================================
CREATE TABLE IF NOT EXISTS admin_auth_codes (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    code_hash   VARCHAR(64) NOT NULL,   -- SHA-256 del código de 6 dígitos
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_codes_email ON admin_auth_codes (email);


-- =========================================================
--  TABLA: orders
--  Cada fila es una factura/pedido generado cuando el usuario
--  confirma el pago en "procesarPago.html". Guarda una foto
--  (snapshot) de los productos comprados en ese momento.
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number  VARCHAR(50) NOT NULL UNIQUE,
    total           NUMERIC(10, 2) NOT NULL,
    items           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);


-- =========================================================
--  TABLA: session
--  Guarda las sesiones activas (login de clientes y de admin).
--  La crea automáticamente "connect-pg-simple" al iniciar el
--  servidor, pero puedes crearla manualmente con esto:
-- =========================================================
CREATE TABLE IF NOT EXISTS "session" (
    "sid"    VARCHAR NOT NULL COLLATE "default",
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
)
WITH (OIDS = FALSE);

-- Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS", por eso usamos
-- este bloque DO que revisa si la llave primaria ya existe antes de crearla.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
    ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number  VARCHAR(50) NOT NULL UNIQUE,
    total           NUMERIC(10, 2) NOT NULL,
    items           JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);

```
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT FALSE;4
```

## Resumen de las tablas

| Tabla               | Para qué sirve                                                                 |
|----------------------|---------------------------------------------------------------------------------|
| `users`              | Cuentas de clientes (registro / inicio de sesión)                              |
| `cart_items`         | Productos que cada usuario tiene en su carrito                                 |
| `admin_auth_codes`   | Códigos temporales de 6 dígitos para entrar al dashboard de administración     |
| `session`            | Sesiones activas (quién está logueado y quién es admin en este momento)        |

## Notas de seguridad

- Las contraseñas **nunca** se guardan en texto plano: se guardan con `bcrypt` (hash + salt).
- Los códigos de administrador **nunca** se guardan en texto plano: se guarda un hash SHA-256, y expiran a los 10 minutos.
- El único correo autorizado para pedir un código de administrador se define en la variable de entorno `ADMIN_EMAIL` del archivo `.env` (por defecto: `isabellacastrocamacho117@gmail.com`).
