# Jaguar Reserva — Backend (Persona 1: Conexión + Login)

Base del backend: conexión a MySQL, sesiones y los **3 logins** (estudiante, admin, guardia).
Todos los demás módulos (registro de estudiantes, reservas, etc.) se montan sobre esto.

**Tecnologías:** Node.js · Express · MySQL (`mysql2`) · express-session · bcryptjs · CORS.

---

## 1. Requisitos previos
- **Node.js** instalado (versión 18 o superior). Comprueba con: `node -v`
- **MySQL** + **MySQL Workbench**.
- **VS Code** (recomendado: extensión *REST Client* para usar `peticiones.http`).

## 2. Preparar la base de datos (MySQL Workbench)
1. Abre `jaguar_reserva.sql` en Workbench y ejecútalo (crea la base y las tablas).
2. Abre `seed_prueba.sql` y ejecútalo (inserta 1 admin, 1 guardia y 3 estudiantes de prueba).

## 3. Configurar y correr el backend
```bash
cd JR/backend
npm install                 # instala las dependencias
copy .env.example .env      # Windows  (en Mac/Linux: cp .env.example .env)
# edita .env y pon tu usuario y password de MySQL
npm run dev                 # arranca con recarga automática (o: npm start)
```
Si todo está bien verás:
```
OK  Conectado a MySQL: jaguar_reserva
Servidor en http://localhost:3000
```

## 4. Probar los endpoints
Abre `peticiones.http` en VS Code (con la extensión *REST Client*) y pulsa **Send Request**,
o usa Thunder Client / Postman.

| Método | Ruta | Body (JSON) |
|--------|------|-------------|
| POST | `/login/estudiante` | `{ "cuenta": "42411126", "dni": "0801200500123" }` |
| POST | `/login/admin` | `{ "correo": "keila@ceutec.hn", "contrasena": "admin123" }` |
| POST | `/login/guardia` | `{ "usuario": "guardia", "contrasena": "guardia123" }` |
| GET | `/session` | — (devuelve quién está logueado) |
| POST | `/logout` | — |

Respuesta de un login correcto:
```json
{ "ok": true, "rol": "admin", "usuario": { "id": 1, "rol": "admin", "nombre": "Lic. Keila Duarte", "correo": "keila@ceutec.hn" }, "redirigir": "admin/dashboard.html" }
```

### Credenciales de prueba
- **Estudiante:** cuenta `42411126` · dni `0801200500123`
- **Admin:** `keila@ceutec.hn` · `admin123`
- **Guardia:** usuario `guardia` · `guardia123`

## 5. Para el resto del equipo
- **Persona 3 (login visual):** manda los datos con `fetch(..., { credentials: 'include' })` a estos endpoints y redirige según el campo `redirigir` (o `rol`) de la respuesta.
- **Persona 2, 4, 5:** protejan sus rutas reutilizando `middleware/auth.js`:
  ```js
  const { requireLogin, requireRole } = require('../middleware/auth');
  router.post('/estudiantes/subir', requireRole('admin'), handler); // solo admin
  router.get('/reservas', requireLogin, handler);                    // cualquiera logueado
  ```
- Monten sus rutas en `server.js` con `app.use('/', require('./routes/...'))`.

## 6. Notas
- Las contraseñas de **admin** y **guardia** se guardan cifradas con **bcrypt**. Para crear una nueva:
  `node generar_hash.js miContrasena` y pega el resultado en el INSERT.
- El **DNI del estudiante** va en texto plano (así lo define el esquema; viene del Excel).
- **No subas** `.env` ni `node_modules` a git (ya están en `.gitignore`).
- Soy el primero en subir: al terminar hago `git push` y ustedes hacen `git pull` para conectarse.

## Estructura
```
JR/backend/
├── server.js            # arranca Express, CORS y sesiones
├── db.js                # pool de conexión a MySQL
├── routes/auth.js       # los 3 logins + /session + /logout
├── middleware/auth.js   # requireLogin / requireRole (reutilizable)
├── generar_hash.js      # utilidad para cifrar contraseñas (bcrypt)
├── seed_prueba.sql      # datos de prueba (admin, guardia, estudiantes)
├── peticiones.http      # pruebas rápidas de los endpoints
├── .env.example         # plantilla de credenciales (copiar a .env)
├── .gitignore
└── package.json
```
