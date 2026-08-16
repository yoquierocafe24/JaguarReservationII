// db.js — Pool de conexion a MySQL (Persona 1)
// Todos los demas modulos importan este pool para hacer consultas.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  if (rows[0].total === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureStandardSchema() {
  try {
    const conn = await pool.getConnection();

    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS espacios (
          id_espacio INT NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(100) NOT NULL,
          descripcion TEXT NULL,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (id_espacio)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS estudiantes (
          id_estudiante INT NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(150) NOT NULL,
          dni VARCHAR(50) NOT NULL,
          cuenta VARCHAR(50) NOT NULL,
          correo VARCHAR(150) NULL,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (id_estudiante),
          UNIQUE KEY uq_estudiante_cuenta (cuenta),
          UNIQUE KEY uq_estudiante_dni (dni)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS administradores (
          id_admin INT NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(150) NOT NULL,
          correo VARCHAR(150) NOT NULL,
          contrasena VARCHAR(255) NOT NULL,
          PRIMARY KEY (id_admin),
          UNIQUE KEY uq_admin_correo (correo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS guardia (
          id_guardia INT NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(150) NOT NULL,
          usuario VARCHAR(100) NOT NULL,
          contrasena VARCHAR(255) NOT NULL,
          PRIMARY KEY (id_guardia),
          UNIQUE KEY uq_guardia_usuario (usuario)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS reservas (
          id_reserva VARCHAR(50) NOT NULL,
          id_estudiante INT NOT NULL,
          id_espacio INT NULL,
          id_item INT NULL,
          tipo_reserva VARCHAR(30) NOT NULL DEFAULT 'individual',
          id_equipo INT NULL,
          fecha DATE NOT NULL,
          hora_inicio TIME NOT NULL,
          hora_fin TIME NOT NULL,
          telefono VARCHAR(20) NULL,
          solicitud_especial TEXT NULL,
          cant_acompanantes INT NOT NULL DEFAULT 0,
          estado VARCHAR(30) NOT NULL DEFAULT 'aprobada',
          qr_token VARCHAR(255) NULL,
          cancelado_por VARCHAR(50) NULL,
          motivo_cancelacion TEXT NULL,
          PRIMARY KEY (id_reserva),
          KEY fk_reserva_estudiante_idx (id_estudiante),
          KEY fk_reserva_espacio_idx (id_espacio),
          CONSTRAINT fk_reserva_estudiante
            FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id_estudiante)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_reserva_espacio
            FOREIGN KEY (id_espacio) REFERENCES espacios(id_espacio)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS calendario_bloqueos (
          id_bloqueo INT NOT NULL AUTO_INCREMENT,
          fecha_inicio DATE NULL,
          fecha_fin DATE NULL,
          hora_inicio TIME NULL,
          hora_fin TIME NULL,
          dia_completo TINYINT(1) NOT NULL DEFAULT 0,
          id_espacio INT NULL,
          motivo VARCHAR(255) NULL,
          origen VARCHAR(50) NULL DEFAULT 'manual',
          PRIMARY KEY (id_bloqueo),
          KEY fk_bloqueo_espacio_idx (id_espacio),
          CONSTRAINT fk_bloqueo_espacio
            FOREIGN KEY (id_espacio) REFERENCES espacios(id_espacio)
            ON DELETE SET NULL ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS periodo_academico (
          id_periodo INT NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(100) NOT NULL,
          fecha_inicio DATE NOT NULL,
          fecha_fin DATE NOT NULL,
          estado VARCHAR(20) NOT NULL DEFAULT 'Activo',
          PRIMARY KEY (id_periodo),
          UNIQUE KEY uq_periodo_nombre (nombre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS estudiante_periodo (
          id INT NOT NULL AUTO_INCREMENT,
          id_estudiante INT NOT NULL,
          id_periodo INT NOT NULL,
          carrera VARCHAR(150) NULL,
          tipo_ingreso VARCHAR(100) NULL,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          PRIMARY KEY (id),
          UNIQUE KEY uq_estudiante_periodo (id_estudiante, id_periodo),
          KEY fk_ep_estudiante_idx (id_estudiante),
          KEY fk_ep_periodo_idx (id_periodo),
          CONSTRAINT fk_ep_estudiante
            FOREIGN KEY (id_estudiante) REFERENCES estudiantes(id_estudiante)
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT fk_ep_periodo
            FOREIGN KEY (id_periodo) REFERENCES periodo_academico(id_periodo)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await ensureColumn('espacios', 'descripcion', 'TEXT NULL');
      await ensureColumn('espacios', 'activo', 'TINYINT(1) NOT NULL DEFAULT 1');

      await ensureColumn('estudiantes', 'dni', 'VARCHAR(50) NULL');
      await ensureColumn('estudiantes', 'cuenta', 'VARCHAR(50) NULL');
      await ensureColumn('estudiantes', 'correo', 'VARCHAR(150) NULL');
      await ensureColumn('estudiantes', 'activo', 'TINYINT(1) NOT NULL DEFAULT 1');

      await ensureColumn('administradores', 'nombre', 'VARCHAR(150) NULL');
      await ensureColumn('administradores', 'correo', 'VARCHAR(150) NULL');
      await ensureColumn('administradores', 'contrasena', 'VARCHAR(255) NULL');

      await ensureColumn('guardia', 'nombre', 'VARCHAR(150) NULL');
      await ensureColumn('guardia', 'usuario', 'VARCHAR(100) NULL');
      await ensureColumn('guardia', 'contrasena', 'VARCHAR(255) NULL');

      await ensureColumn('reservas', 'id_espacio', 'INT NULL');
      await ensureColumn('reservas', 'id_item', 'INT NULL');
      await ensureColumn('reservas', 'tipo_reserva', 'VARCHAR(30) NOT NULL DEFAULT "individual"');
      await ensureColumn('reservas', 'id_equipo', 'INT NULL');
      await ensureColumn('reservas', 'fecha', 'DATE NULL');
      await ensureColumn('reservas', 'hora_inicio', 'TIME NULL');
      await ensureColumn('reservas', 'hora_fin', 'TIME NULL');
      await ensureColumn('reservas', 'telefono', 'VARCHAR(20) NULL');
      await ensureColumn('reservas', 'solicitud_especial', 'TEXT NULL');
      await ensureColumn('reservas', 'cant_acompanantes', 'INT NOT NULL DEFAULT 0');
      await ensureColumn('reservas', 'estado', 'VARCHAR(30) NOT NULL DEFAULT "aprobada"');
      await ensureColumn('reservas', 'qr_token', 'VARCHAR(255) NULL');
      await ensureColumn('reservas', 'cancelado_por', 'VARCHAR(50) NULL');
      await ensureColumn('reservas', 'motivo_cancelacion', 'TEXT NULL');

      await ensureColumn('calendario_bloqueos', 'fecha_inicio', 'DATE NULL');
      await ensureColumn('calendario_bloqueos', 'fecha_fin', 'DATE NULL');
      await ensureColumn('calendario_bloqueos', 'hora_inicio', 'TIME NULL');
      await ensureColumn('calendario_bloqueos', 'hora_fin', 'TIME NULL');
      await ensureColumn('calendario_bloqueos', 'dia_completo', 'TINYINT(1) NOT NULL DEFAULT 0');
      await ensureColumn('calendario_bloqueos', 'id_espacio', 'INT NULL');
      await ensureColumn('calendario_bloqueos', 'motivo', 'VARCHAR(255) NULL');
      await ensureColumn('calendario_bloqueos', 'origen', 'VARCHAR(50) NULL DEFAULT "manual"');

      const [espacios] = await conn.query('SELECT COUNT(*) AS total FROM espacios');
      if (espacios[0].total === 0) {
        await conn.query(`
          INSERT INTO espacios (id_espacio, nombre, descripcion, activo) VALUES
          (1, 'Espacio 1', 'Espacio principal', 1),
          (2, 'Espacio 2', 'Espacio secundario', 1),
          (3, 'Espacio 3', 'Espacio adicional', 1),
          (4, 'Espacio 4', 'Espacio reservado', 1)
          ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
        `);
      }

      const [adminRows] = await conn.query('SELECT COUNT(*) AS total FROM administradores');
      if (adminRows[0].total === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        await conn.query(
          'INSERT INTO administradores (nombre, correo, contrasena) VALUES (?, ?, ?)',
          ['Lic. Keila Duarte', 'keila@ceutec.hn', hash]
        );
      }

      const [guardiaRows] = await conn.query('SELECT COUNT(*) AS total FROM guardia');
      if (guardiaRows[0].total === 0) {
        const hash = bcrypt.hashSync('guardia123', 10);
        await conn.query(
          'INSERT INTO guardia (nombre, usuario, contrasena) VALUES (?, ?, ?)',
          ['Carlos Nunez', 'guardia', hash]
        );
      }

      const [estudiantesRows] = await conn.query('SELECT COUNT(*) AS total FROM estudiantes');
      if (estudiantesRows[0].total === 0) {
        await conn.query(
          'INSERT INTO estudiantes (nombre, dni, cuenta, correo, activo) VALUES (?, ?, ?, ?, ?)',
          ['Richard Calderon', '0801200500123', '42411126', 'rcalderon@ceutec.hn', 1]
        );
      }

      const [periodRows] = await conn.query('SELECT COUNT(*) AS total FROM periodo_academico');
      if (periodRows[0].total === 0) {
        const hoy = new Date();
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 0);
        const nombrePeriodo = `${hoy.getFullYear()}-T${Math.ceil((hoy.getMonth() + 1) / 3)}`;

        await conn.query(
          'INSERT INTO periodo_academico (nombre, fecha_inicio, fecha_fin, estado) VALUES (?, ?, ?, ?)',
          [
            nombrePeriodo,
            inicio.toISOString().slice(0, 10),
            fin.toISOString().slice(0, 10),
            'Activo'
          ]
        );
      }

      const [fkReserva] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'reservas'
           AND CONSTRAINT_NAME = 'fk_reserva_espacio'`
      );
      if (fkReserva[0].total === 0) {
        await conn.query(
          'ALTER TABLE reservas ADD CONSTRAINT fk_reserva_espacio FOREIGN KEY (id_espacio) REFERENCES espacios(id_espacio) ON DELETE SET NULL ON UPDATE CASCADE'
        );
      }

      const [fkBloqueos] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'calendario_bloqueos'
           AND CONSTRAINT_NAME = 'fk_bloqueo_espacio'`
      );
      if (fkBloqueos[0].total === 0) {
        await conn.query(
          'ALTER TABLE calendario_bloqueos ADD CONSTRAINT fk_bloqueo_espacio FOREIGN KEY (id_espacio) REFERENCES espacios(id_espacio) ON DELETE SET NULL ON UPDATE CASCADE'
        );
      }

      console.log('OK  Esquema estandarizado para Jaguar Reserva.');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('ERROR al estandarizar la base de datos:', err.message);
    throw err;
  }
}

// Prueba de conexion al arrancar (para ver rapido si la BD esta bien configurada)
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('OK  Conectado a MySQL:', process.env.DB_NAME || 'jaguar_reserva');
    conn.release();
    await ensureStandardSchema();
  } catch (err) {
    console.error('ERROR al conectar a MySQL:', err.message);
    console.error('    Revisa tu archivo .env (usuario, password, nombre de la BD).');
  }
})();

module.exports = pool;
module.exports.ensureStandardSchema = ensureStandardSchema;
