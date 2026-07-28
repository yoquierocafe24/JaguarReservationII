// generar_hash.js — Utilidad para crear una contrasena cifrada (bcrypt).
// Sirve para agregar nuevos admins o guardias a la base de datos.
//
// Uso:   node generar_hash.js miContrasena123
// Copia el resultado y pegalo en la columna "contrasena" del INSERT.

const bcrypt = require('bcryptjs');

const texto = process.argv[2];
if (!texto) {
  console.log('Uso: node generar_hash.js <contrasena>');
  process.exit(1);
}

const hash = bcrypt.hashSync(texto, 10);
console.log(hash);
