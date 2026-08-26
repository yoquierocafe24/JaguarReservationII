# Instrucciones para ejecutar el proyecto JaguarReservationII

Resumen rápido
- Backend: carpeta `Backend` (API Node/Express).
- Frontend: carpeta `Frontend` (aplicación cliente estática/Node).
- Base de datos: MySQL (debe estar disponible y con el esquema apropiado).

Requisitos previos
- Node.js (v16+ recomendado, Node 24 probado en sandbox).
- npm (v8+), MySQL local o accesible.
- Git (opcional para clonar/traer ramas).

Estructura relevante
- `Backend/` — servidor Node/Express, scripts y tests.
- `Frontend/` — cliente (HTML/CSS/JS) o app Node.
- `patches/` — parches y bundles generados para transporte.

Variables de entorno (.env)
Coloca un archivo `.env` en la raíz de `Backend/` con al menos las siguientes variables (ejemplo):

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_password_mysql
DB_NAME=jaguar_reserva
PORT=3000
JWT_SECRET=alguna_clave_secreta_opcional
# Otras variables específicas que use el proyecto
```

Nota: No subas `.env` al repositorio. El proyecto incluye `.gitignore` con `node_modules` y `.env`.

Pasos para levantar el Backend
1. Abrir terminal y posicionarse en la carpeta `Backend`:
```bash
cd /ruta/al/proyecto/JaguarReservationII/Backend
```
2. Instalar dependencias (ejecuta `postinstall` si está definido):
```bash
npm install
```
3. Asegúrate de que MySQL esté corriendo y las credenciales del `.env` sean correctas.
4. Ejecutar migraciones o crear esquema si aplica (si el repo incluye scripts de inicialización, ejecutarlos). Si no hay script, crear la base `DB_NAME` indicada en `.env`.
5. Iniciar el servidor:
```bash
npm start
# o, si hay script dev:
npm run dev
```
6. Probar el endpoint raíz (por defecto `PORT=3000`):
```bash
curl -sS http://localhost:3000/ | jq .
```

Pasos para levantar el Frontend
1. Abrir terminal y posicionarse en la carpeta `Frontend`:
```bash
cd /ruta/al/proyecto/JaguarReservationII/Frontend
```
2. Instalar dependencias:
```bash
npm install
```
3. Iniciar la aplicación cliente (comando típico):
```bash
npm start
# o:
npm run dev
```
4. Abrir el navegador en la URL que indique la consola (por ejemplo `http://localhost:3000` o el puerto que muestre el frontend).

Tests
- Desde la carpeta `Backend` puedes correr los tests añadidos:
```bash
cd Backend
node --test tests/backend-reglas.test.js
```

Empaquetado para entrega
- Ya hay un tarball generado `JaguarReservationII_release.tar.gz` que excluye `node_modules` y `.env`.
- También están disponibles `patches/0001-...patch` y `patches/correciones-backend.bundle` para aplicar la rama en otra máquina.

Notas adicionales
- Si al instalar ves errores relacionados con paquetes que incluyen `tsconfig.json` o archivos de tipo (ej. `xlsx`), el proyecto ya incluye un script de parche en `Backend/scripts/patch-xlsx-tsconfig.js` ejecutable como `postinstall`.
- Para compartir cambios sin acceso a Git remoto, usa el bundle: copia `patches/correciones-backend.bundle` a la máquina destino y ejecuta `git fetch /ruta/al/bundle correciones-backend:correciones-backend`.

Contacto
- Si necesitas que prepare un `README.md` más formal o que incluya capturas/ejemplos concretos, dímelo y lo añado.
