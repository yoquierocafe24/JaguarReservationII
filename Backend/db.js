// db.js — Pool de conexion a MySQL (Persona 1)
// Todos los demas modulos importan este pool para hacer consultas.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jaguar_reserva',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Prueba de conexion al arrancar (para ver rapido si la BD esta bien configurada)
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('OK  Conectado a MySQL:', process.env.DB_NAME || 'jaguar_reserva');
    conn.release();
  } catch (err) {
    console.error('ERROR al conectar a MySQL:', err.message);
    console.error('    Revisa tu archivo .env (usuario, password, nombre de la BD).');
  }
})();

module.exports = pool;
