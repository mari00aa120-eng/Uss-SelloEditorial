# USS Sello Editorial — Tienda con login, carrito y dashboard de administrador

Este proyecto tiene dos partes:

- **`/public`** → tu frontend (los `.html`, `.css` y `assets` que ya tenías, ahora conectados a un backend real).
- **`/server`** → el backend en Node.js + Express que maneja usuarios, carrito y el dashboard de administración con verificación por correo (Brevo) y base de datos (Neon).

No necesitas saber nada de esto de antemano: sigue los pasos en orden y al final vas a tener todo funcionando.

---

## 0. Estructura de carpetas (seguridad del código)

```
uss-landing-project/
├── public/                  ← Frontend (se sirve tal cual al navegador)
│   ├── assets/js/            ← session.js, cart-actions.js, cart-page.js
│   ├── admin-login.html      ← login del dashboard (correo + código)
│   ├── carrito.html
│   ├── catalogo.html
│   └── ... (resto de tus páginas)
│
├── server/                  ← Backend (nunca se expone directo al navegador)
│   ├── config/
│   │   ├── db.js             ← conexión a Neon
│   │   └── brevo.js          ← envío de correos con Brevo
│   ├── middleware/
│   │   └── auth.js           ← protege rutas privadas (carrito, admin)
│   ├── routes/
│   │   ├── auth.routes.js    ← registro / login / logout
│   │   ├── cart.routes.js    ← carrito
│   │   └── admin.routes.js   ← código de acceso + dashboard
│   ├── views/
│   │   └── admin-dashboard.html  ← SOLO se entrega si la sesión es admin válida
│   └── server.js             ← arranca todo
│
├── .env.example              ← plantilla de variables (cópiala a ".env")
├── .gitignore                ← evita subir el ".env" a GitHub por error
├── package.json
├── railway.json / Procfile   ← configuración para desplegar en Railway
└── DATABASE.md               ← el SQL para crear las tablas en Neon
```

**¿Por qué es seguro?**
- Las contraseñas nunca se guardan en texto plano (se cifran con `bcrypt`).
- El HTML del dashboard de administrador (`admin-dashboard.html`) vive **fuera** de `/public`, así que nadie puede abrirlo escribiendo la URL directamente: el servidor solo lo entrega si tu sesión ya pasó por la verificación de correo + código.
- El archivo `.env` (donde van tus claves reales) nunca se sube a GitHub gracias al `.gitignore`.
- Los códigos de acceso al dashboard se guardan cifrados (hash) y expiran en 10 minutos.

---

## 1. Instala las herramientas en tu computadora (una sola vez)

1. Instala **Node.js** (versión 18 o superior): https://nodejs.org (descarga la versión "LTS").
   - Para comprobar que quedó instalado, abre una terminal y escribe:
     ```
     node -v
     npm -v
     ```
     Deberías ver números de versión, no un error.
2. Instala **Visual Studio Code**: https://code.visualstudio.com
3. Abre VS Code → `File > Open Folder` → selecciona la carpeta `uss-landing-project` que te entregué.

---

## 2. Crear la base de datos en NEON (PostgreSQL gratis)

1. Ve a **https://neon.tech** y crea una cuenta gratuita (puedes usar tu correo de Google).
2. Una vez dentro, haz clic en **"Create a project"** (Crear un proyecto).
   - Nombre del proyecto: `uss-sello-editorial` (o el que quieras).
   - Región: elige la más cercana a Perú (por ejemplo, `US East` si no hay una de Sudamérica).
   - Versión de Postgres: deja la que viene por defecto.
3. Cuando el proyecto se cree, Neon te mostrará un **"Connection String"** (cadena de conexión). Se ve así:
   ```
   postgresql://usuario:contraseña@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   **Cópiala completa**, la vas a necesitar en el paso 5.
   - Si no la ves de inmediato, ve al menú lateral → **"Connection Details"** o **"Dashboard"**, y asegúrate de que el modo esté en **"Pooled connection"** (conexión agrupada), que es la recomendada para apps web.
4. Ahora crea las tablas:
   - En el menú lateral de Neon, entra a **"SQL Editor"**.
   - Abre el archivo `DATABASE.md` que te entregué (está en la raíz del proyecto).
   - Copia todo el bloque de código SQL que empieza con `CREATE TABLE IF NOT EXISTS users (...)`.
   - Pégalo en el SQL Editor de Neon y presiona **"Run"**.
   - Deberías ver un mensaje de éxito y, en la pestaña **"Tables"**, aparecerán: `users`, `cart_items`, `admin_auth_codes` (la tabla `session` se crea sola cuando arranques el servidor por primera vez).

✅ Con esto, Neon ya está listo.

---

## 3. Configurar BREVO (para enviar el código de acceso al dashboard)

1. Ve a **https://www.brevo.com** y crea una cuenta gratuita (el plan gratis alcanza sin problema para esto).
2. Verifica tu correo (Brevo te manda un correo de confirmación al registrarte).
3. **Crear tu API Key:**
   - Dentro de Brevo, haz clic en tu nombre/ícono (arriba a la derecha) → **"SMTP & API"**.
   - Ve a la pestaña **"API Keys"**.
   - Haz clic en **"Generate a new API key"** (Generar una nueva clave API).
   - Ponle un nombre, por ejemplo `uss-sello-editorial`.
   - Copia la clave que te muestra (empieza con `xkeysib-...`). **Guárdala**, Brevo solo la muestra una vez.
4. **Verificar tu correo remitente** (el correo desde el cual se enviarán los códigos):
   - En Brevo, ve a **"Senders, Domains & Dedicated IPs"** (Remitentes, dominios e IPs dedicadas).
   - Haz clic en **"Add a sender"** (Agregar remitente).
   - Escribe el nombre (ej. "USS Sello Editorial") y el correo que quieres usar para enviar (puede ser tu propio Gmail mientras pruebas, o un correo de tu dominio si tienes uno).
   - Brevo te enviará un correo de verificación a esa dirección: ábrelo y confirma.
   - Una vez verificado, ese es el correo que vas a poner en `BREVO_SENDER_EMAIL` (paso 5).

✅ Con esto, Brevo ya está listo para enviar los códigos de verificación del panel de administrador.

---

## 4. Instalar las dependencias del proyecto

1. En VS Code, abre una terminal: menú **Terminal > New Terminal**.
2. Asegúrate de estar en la carpeta raíz del proyecto (donde está `package.json`).
3. Ejecuta:
   ```
   npm install
   ```
   Esto descarga todas las librerías que el backend necesita (Express, conexión a Postgres, Brevo, etc.). Puede tardar 1-2 minutos.

---

## 5. Configurar tu archivo `.env` (tus claves privadas)

1. En VS Code, busca el archivo **`.env.example`** en la raíz del proyecto.
2. Haz una copia y renómbrala a **`.env`** (sin ".example").
   - En VS Code: clic derecho sobre `.env.example` → "Copy" → clic derecho en la carpeta → "Paste" → renombra la copia a `.env`.
3. Abre `.env` y reemplaza cada valor:

   ```
   DATABASE_URL=   → pega aquí el "Connection String" completo que copiaste de Neon (paso 2.3)
   BREVO_API_KEY=  → pega aquí tu API Key de Brevo (paso 3.3)
   BREVO_SENDER_EMAIL= → el correo remitente que verificaste en Brevo (paso 3.4)
   BREVO_SENDER_NAME=  → el nombre que quieres que aparezca como remitente
   ADMIN_EMAIL=isabellacastrocamacho117@gmail.com   → déjalo así, es el único correo autorizado al dashboard
   SESSION_SECRET= → una cadena larga y aleatoria (ver abajo cómo generarla)
   NODE_ENV=development
   PORT=3000
   ```

4. Para generar un `SESSION_SECRET` seguro, en la terminal de VS Code ejecuta:
   ```
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   Copia el resultado y pégalo como valor de `SESSION_SECRET`.

5. Guarda el archivo `.env`. **Nunca lo compartas ni lo subas a GitHub** (ya está protegido por `.gitignore`).

---

## 6. Probar todo en tu computadora (antes de publicarlo)

1. En la terminal de VS Code, ejecuta:
   ```
   npm start
   ```
2. Deberías ver:
   ```
   USS Sello Editorial escuchando en el puerto 3000 (desarrollo)
   ```
3. Abre tu navegador en **http://localhost:3000/inicio.html**
4. Prueba:
   - Crear una cuenta nueva (botón "Registrarse").
   - Cerrar sesión y volver a entrar (botón "Iniciar Sesión").
   - Agregar libros al carrito desde el catálogo.
   - Entrar a `carrito.html` y ver que los productos reales aparecen.
   - Ir a **http://localhost:3000/admin-login.html**, escribir el correo `isabellacastrocamacho117@gmail.com`, revisar tu bandeja de entrada (te llegará el código gracias a Brevo) e ingresarlo para entrar al dashboard.

Si algo falla, revisa el mensaje de error en la terminal: casi siempre es porque falta una variable en `.env` o porque copiaste mal el `DATABASE_URL`.

---

## 7. Subir el proyecto a GitHub (recomendado antes de Railway)

1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio nuevo (vacío, sin README).
3. En la terminal de VS Code:
   ```
   git init
   git add .
   git commit -m "Primera version de la tienda USS"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```
   (Reemplaza la URL con la de tu propio repositorio). Como `.env` está en `.gitignore`, tus claves privadas **no** se subirán.

---

## 8. Desplegar en RAILWAY

1. Ve a **https://railway.app** y crea una cuenta (puedes entrar con tu cuenta de GitHub, es lo más simple).
2. Haz clic en **"New Project"** (Nuevo proyecto).
3. Selecciona **"Deploy from GitHub repo"** (Desplegar desde repositorio de GitHub).
   - Si es la primera vez, Railway te pedirá autorizar el acceso a tu cuenta de GitHub. Acéptalo.
   - Elige el repositorio que subiste en el paso 7.
4. Railway va a detectar automáticamente que es un proyecto Node.js (gracias al `package.json` y `railway.json` que ya están incluidos) y empezará a construirlo. **Se va a caer/fallar la primera vez** porque aún no configuramos las variables de entorno — eso es normal, sigue al siguiente paso.
5. **Configurar las variables de entorno en Railway:**
   - Dentro de tu proyecto en Railway, haz clic en el servicio (la cajita con el nombre de tu repo).
   - Ve a la pestaña **"Variables"**.
   - Agrega, una por una, las mismas variables que pusiste en tu `.env` local:
     - `DATABASE_URL`
     - `BREVO_API_KEY`
     - `BREVO_SENDER_EMAIL`
     - `BREVO_SENDER_NAME`
     - `ADMIN_EMAIL`
     - `SESSION_SECRET`
     - `NODE_ENV` → ponlo en `production` (importante, distinto a tu `.env` local)
   - **No necesitas** agregar `PORT`: Railway lo asigna automáticamente.
6. Ve a la pestaña **"Deployments"** (Despliegues) y espera a que termine de construir. Cuando el estado diga **"Success"** (Éxito), tu app ya está viva.
7. Para obtener tu URL pública:
   - Ve a la pestaña **"Settings"** del servicio.
   - En la sección **"Networking"**, haz clic en **"Generate Domain"** (Generar dominio).
   - Railway te dará una URL como `https://uss-sello-editorial-production.up.railway.app`.
   hola
8. Abre esa URL + `/inicio.html` en tu navegador, por ejemplo:
   ```
   https://uss-sello-editorial-production.up.railway.app/inicio.html
   ```
   y prueba de nuevo el registro, login, carrito y el dashboard de admin, igual que en el paso 6.

### Cada vez que quieras actualizar la página en producción
Solo necesitas hacer `git push` a tu repositorio de GitHub (`git add .` → `git commit -m "cambios"` → `git push`). Railway detecta el cambio automáticamente y vuelve a desplegar.

---

## Resumen de lo que pediste y dónde está

| Pediste | Dónde está |
|---|---|
| Login/registro con carrito visible solo si hay sesión | `public/assets/js/session.js` + `server/routes/auth.routes.js` |
| Avatar + nombre + botón de carrito en vez de "Iniciar sesión"/"Registrarse" en cualquier página | `public/assets/js/session.js` (se incluye en todas las páginas) |
| Botón de carrito que lleva directo a `carrito.html` | Mismo archivo, botón `#navCartBtn` |
| Dashboard protegido solo para `isabellacastrocamacho117@gmail.com` con código por correo | `server/routes/admin.routes.js`, `public/admin-login.html`, `server/views/admin-dashboard.html` |
| Neon (base de datos) | `server/config/db.js`, `DATABASE.md` |
| Brevo (envío de correos) | `server/config/brevo.js` |
| Despliegue en Railway | `railway.json`, `Procfile`, sección 8 de este documento |
| Carpetas organizadas en VS Code | Ver sección 0 |
| Archivo `.env` para tus claves | `.env.example` (cópialo a `.env`) |
| SQL de la base de datos | `DATABASE.md` |

---

## Notas finales de seguridad

- Nunca compartas tu `.env` ni lo subas a GitHub.
- El único correo que puede pedir un código de administrador está fijado en la variable `ADMIN_EMAIL`. Si algún día quieres cambiarlo, solo edita esa variable (en tu `.env` local y en Railway) — no necesitas tocar código.
- Las contraseñas de los usuarios se guardan cifradas (bcrypt), nunca en texto plano.
- Hay límites de intentos (rate limiting) en login y en la solicitud de códigos de administrador para dificultar ataques de fuerza bruta.
