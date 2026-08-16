const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');


// =======================================
// Middlewares de ayuda
// =======================================

function requiereSesion(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Debe iniciar sesión.'
        });
    }
    next();
}

function requiereAdmin(req, res, next) {
    if (req.session.usuario.rol !== 'admin') {
        return res.status(403).json({
            ok: false,
            mensaje: 'No tiene permisos.'
        });
    }
    next();
}

function requiereSuperAdmin(req, res, next) {
    if (
        req.session.usuario.rol !== 'admin' ||
        !req.session.usuario.es_superadmin
    ) {
        return res.status(403).json({
            ok: false,
            mensaje: 'Solo el administrador principal puede realizar esta acción.'
        });
    }
    next();
}


// ===============================
// LOGIN ADMIN
// ===============================
router.post('/login/admin', async (req, res) => {

    try {

        const { correo, contrasena } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM administradores WHERE correo = ?',
            [correo]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Correo o contraseña incorrectos'
            });
        }

        const admin = rows[0];

        const coincide = await bcrypt.compare(contrasena, admin.contrasena);

        if (!coincide) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Correo o contraseña incorrectos'
            });
        }

        req.session.usuario = {
            id: admin.id_admin,
            rol: 'admin',
            nombre: admin.nombre,
            correo: admin.correo,
            es_superadmin: Boolean(admin.es_superadmin)
        };

        res.json({
            ok: true,
            rol: 'admin',
            usuario: req.session.usuario,
            redirigir: 'Frontend/admin/dashboard.html'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor'
        });

    }

});


// ===============================
// LOGIN GUARDIA
// ===============================
router.post('/login/guardia', async (req, res) => {

    try {

        const { usuario, contrasena } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM guardia WHERE usuario = ?',
            [usuario]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Usuario o contraseña incorrectos'
            });
        }

        const guardia = rows[0];

        const coincide = await bcrypt.compare(contrasena, guardia.contrasena);
       // const coincide = contrasena === guardia.contrasena;

        if (!coincide) {

            return res.status(401).json({
                ok: false,
                mensaje: 'Usuario o contraseña incorrectos'
            });

        }

        req.session.usuario = {
            id: guardia.id_guardia,
            rol: 'guardia',
            nombre: guardia.nombre,
            usuario: guardia.usuario
        };

        res.json({
            ok: true,
            rol: 'guardia',
            usuario: req.session.usuario,
            redirigir: 'Frontend/guardia/panel.html'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor'
        });

    }

});


// ===============================
// LOGIN ESTUDIANTE
// ===============================
router.post('/login/estudiante', async (req, res) => {

    try {

        const { cuenta, dni } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM estudiantes WHERE cuenta = ?',
            [cuenta]
        );

        if (rows.length === 0) {

            return res.status(401).json({
                ok: false,
                mensaje: 'Cuenta o DNI incorrectos'
            });

        }

        const estudiante = rows[0];

        if (!estudiante.activo) {

            return res.status(403).json({
                ok: false,
                mensaje: 'El estudiante está inactivo'
            });

        }

      if (!estudiante.dni.endsWith(dni)) {

            return res.status(401).json({
                ok: false,
                mensaje: 'Cuenta o DNI incorrectos'
            });

        }

        req.session.usuario = {
            id: estudiante.id_estudiante,
            rol: 'estudiante',
            nombre: estudiante.nombre,
            cuenta: estudiante.cuenta,
            correo: estudiante.correo
        };

        res.json({
            ok: true,
            rol: 'estudiante',
            usuario: req.session.usuario,
            redirigir:  'Frontend/usuario/inicio.html'

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor'
        });

    }

});


// ===============================
// VER SESION
// ===============================
router.get('/session', (req, res) => {

    if (!req.session.usuario) {

        return res.json({
            ok: false
        });

    }

    res.json({
        ok: true,
        usuario: req.session.usuario
    });

});


// ===============================
// LOGOUT
// ===============================
router.post('/logout', (req, res) => {

    req.session.destroy(() => {

        res.json({
            ok: true,
            mensaje: 'Sesión cerrada'
        });

    });

});


// ===============================
// EDITAR PERFIL PROPIO (nombre / correo)
// PUT /api/auth/perfil
// ===============================
router.put('/perfil', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { nombre, correo } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe ingresar un nombre.'
            });
        }

        if (!correo || !correo.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe ingresar un correo.'
            });
        }

        const id_admin = req.session.usuario.id;

        // Evitar que el correo choque con otro admin
        const [existente] = await db.query(
            `SELECT id_admin FROM administradores
             WHERE correo = ? AND id_admin != ?`,
            [correo.trim(), id_admin]
        );

        if (existente.length > 0) {
            return res.status(409).json({
                ok: false,
                mensaje: 'Ese correo ya está en uso por otro administrador.'
            });
        }

        await db.query(
            `UPDATE administradores
             SET nombre = ?, correo = ?
             WHERE id_admin = ?`,
            [nombre.trim(), correo.trim(), id_admin]
        );

        // Actualizar la sesión activa con los nuevos datos
        req.session.usuario.nombre = nombre.trim();
        req.session.usuario.correo = correo.trim();

        res.json({
            ok: true,
            mensaje: 'Perfil actualizado correctamente.',
            usuario: req.session.usuario
        });

    } catch (error) {

        console.error('ERROR ACTUALIZANDO PERFIL:', error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor.'
        });

    }

});


// ===============================
// CAMBIAR CONTRASEÑA PROPIA
// PUT /api/auth/password
// ===============================
router.put('/password', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { contrasena_actual, contrasena_nueva } = req.body;

        if (!contrasena_actual || !contrasena_nueva) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe indicar la contraseña actual y la nueva.'
            });
        }

        if (contrasena_nueva.length < 8) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La nueva contraseña debe tener al menos 8 caracteres.'
            });
        }

        const id_admin = req.session.usuario.id;

        const [rows] = await db.query(
            'SELECT contrasena FROM administradores WHERE id_admin = ?',
            [id_admin]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado.'
            });
        }

        const coincide = await bcrypt.compare(
            contrasena_actual,
            rows[0].contrasena
        );

        if (!coincide) {
            return res.status(401).json({
                ok: false,
                mensaje: 'La contraseña actual no es correcta.'
            });
        }

        const nuevoHash = await bcrypt.hash(contrasena_nueva, 10);

        await db.query(
            'UPDATE administradores SET contrasena = ? WHERE id_admin = ?',
            [nuevoHash, id_admin]
        );

        res.json({
            ok: true,
            mensaje: 'Contraseña actualizada correctamente.'
        });

    } catch (error) {

        console.error('ERROR CAMBIANDO CONTRASEÑA:', error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor.'
        });

    }

});


// ===============================
// CREAR NUEVO ADMINISTRADOR
// Solo el superadmin puede hacerlo
// POST /api/auth/crear-admin
// ===============================
router.post('/crear-admin', requiereSesion, requiereSuperAdmin, async (req, res) => {

    try {

        const { nombre, correo, contrasena } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe ingresar un nombre.'
            });
        }

        if (!correo || !correo.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe ingresar un correo.'
            });
        }

        if (!contrasena || contrasena.length < 8) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La contraseña debe tener al menos 8 caracteres.'
            });
        }

        const [existente] = await db.query(
            'SELECT id_admin FROM administradores WHERE correo = ?',
            [correo.trim()]
        );

        if (existente.length > 0) {
            return res.status(409).json({
                ok: false,
                mensaje: 'Ya existe un administrador con ese correo.'
            });
        }

        const hash = await bcrypt.hash(contrasena, 10);

        // El nuevo admin siempre se crea como NO superadmin.
        // Solo se otorga ese privilegio manualmente en la base de datos.
        const [resultado] = await db.query(
            `INSERT INTO administradores (nombre, correo, contrasena, es_superadmin)
             VALUES (?, ?, ?, 0)`,
            [nombre.trim(), correo.trim(), hash]
        );

        res.json({
            ok: true,
            mensaje: 'Administrador creado correctamente.',
            id_admin: resultado.insertId
        });

    } catch (error) {

        console.error('ERROR CREANDO ADMINISTRADOR:', error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor.'
        });

    }

});


module.exports = router;