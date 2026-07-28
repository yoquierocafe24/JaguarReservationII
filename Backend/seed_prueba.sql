-- =============================================
-- SEED DE PRUEBA — Persona 1 (solo para probar el login)
-- Ejecutar en MySQL Workbench DESPUES de jaguar_reserva.sql
-- Los estudiantes REALES los carga Persona 2 desde el Excel;
-- estos son solo para que los logins funcionen de una vez.
-- =============================================
USE jaguar_reserva;

-- Admin  (correo: keila@ceutec.hn   contrasena: admin123)   [bcrypt]
INSERT INTO Administrador (nombre, correo, contrasena) VALUES
('Lic. Keila Duarte', 'keila@ceutec.hn',
 '$2b$10$IjdFdwqhb78l65Jz9l6ode3DRW1TKSzD5/1UEf4yl4OBfb7UjEuP6');

-- Guardia  (usuario: guardia   contrasena: guardia123)   [bcrypt]
INSERT INTO Guardia (nombre, usuario, contrasena) VALUES
('Carlos Nunez', 'guardia',
 '$2b$10$GIAFu7vPAOrWMZ1ZOigUIO1HwdM9mPBtoTVDL/ggv3oYxL5zJudMi');

-- Estudiantes de prueba (el DNI es la contrasena — texto plano por diseno)
INSERT INTO Estudiantes (nombre, dni, cuenta, correo, activo) VALUES
('Richard Calderon',     '0801200500123', '42411126', 'rcalderon@ceutec.hn', 1),
('Maria Fernandez',      '0801200400456', '42411047', 'mfernandez@ceutec.hn', 1),
('Estudiante Inactivo',  '0801200300789', '42411099', 'inactivo@ceutec.hn',   0);
