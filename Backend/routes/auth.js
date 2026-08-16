const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');


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
            correo: admin.correo
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

        if (!cuenta || !dni) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe enviar cuenta y DNI.'
            });
        }

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
        const dniReal = String(estudiante.dni || '');
        const dniIngresado = String(dni).trim();

        if (!estudiante.activo) {

            return res.status(403).json({
                ok: false,
                mensaje: 'El estudiante está inactivo'
            });

        }

        if (!dniReal || !dniReal.endsWith(dniIngresado)) {

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


module.exports = router;