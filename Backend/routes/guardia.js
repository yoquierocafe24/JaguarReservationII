const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// =======================================
// Middlewares de ayuda (sesión / rol admin)
// =======================================

function requiereSesion(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({
            ok: false,
            mensaje: "Debe iniciar sesión."
        });
    }
    next();
}

function requiereAdmin(req, res, next) {
    if (req.session.usuario.rol !== "admin") {
        return res.status(403).json({
            ok: false,
            mensaje: "No tiene permisos para realizar esta acción."
        });
    }
    next();
}

function requiereSuperAdmin(req, res, next) {
    if (
        req.session.usuario.rol !== "admin" ||
        !req.session.usuario.es_superadmin
    ) {
        return res.status(403).json({
            ok: false,
            mensaje: "Solo el administrador principal puede realizar esta acción."
        });
    }
    next();
}

// =======================================
// Validación de contraseña segura
// Mínimo 8 caracteres, al menos una mayúscula,
// una minúscula y un número.
// Los caracteres especiales son opcionales.
// =======================================

function validarContrasena(contrasena) {

    const errores = [];

    if (!contrasena || contrasena.length < 8) {
        errores.push("al menos 8 caracteres");
    }

    if (!/[A-Z]/.test(contrasena || "")) {
        errores.push("al menos una letra mayúscula");
    }

    if (!/[a-z]/.test(contrasena || "")) {
        errores.push("al menos una letra minúscula");
    }

    if (!/[0-9]/.test(contrasena || "")) {
        errores.push("al menos un número");
    }

    return errores;

}

// =======================================
// Listar guardias
// GET /api/guardias
// (cualquier admin puede consultar)
// =======================================

router.get('/', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [guardias] = await db.query(
            `SELECT id_guardia, nombre, usuario
             FROM guardia
             ORDER BY nombre ASC`
        );

        res.json({
            ok: true,
            guardias
        });

    } catch (error) {

        console.error("ERROR LISTANDO GUARDIAS:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Detalle de un guardia
// GET /api/guardias/:id
// (cualquier admin puede consultar)
// =======================================

router.get('/:id', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [rows] = await db.query(
            `SELECT id_guardia, nombre, usuario
             FROM guardia
             WHERE id_guardia = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Guardia no encontrado."
            });

        }

        res.json({
            ok: true,
            guardia: rows[0]
        });

    } catch (error) {

        console.error("ERROR OBTENIENDO GUARDIA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Crear guardia
// POST /api/guardias
// Solo el superadmin puede crear guardias
//
// body: nombre, usuario, contrasena
// =======================================

router.post('/', requiereSesion, requiereSuperAdmin, async (req, res) => {

    try {

        const { nombre, usuario, contrasena } = req.body;

        if (!nombre || !usuario || !contrasena) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar nombre, usuario y contraseña."
            });

        }

        const erroresContrasena = validarContrasena(contrasena);

        if (erroresContrasena.length > 0) {

            return res.status(400).json({
                ok: false,
                mensaje: `La contraseña debe tener ${erroresContrasena.join(", ")}.`
            });

        }

        const [existente] = await db.query(
            `SELECT id_guardia FROM guardia WHERE usuario = ?`,
            [usuario]
        );

        if (existente.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Ya existe un guardia con ese usuario."
            });

        }

        const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

        const [resultado] = await db.query(

            `INSERT INTO guardia(nombre, usuario, contrasena)
             VALUES(?,?,?)`,

            [nombre, usuario, contrasenaHasheada]

        );

        res.json({
            ok: true,
            mensaje: "Guardia creado correctamente.",
            id_guardia: resultado.insertId
        });

    } catch (error) {

        console.error("ERROR CREANDO GUARDIA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Editar guardia
// PUT /api/guardias/:id
// Solo el superadmin puede editar guardias
//
// body: nombre, usuario, contrasena (opcional)
// Si no se envía contrasena, se conserva la actual.
// =======================================

router.put('/:id', requiereSesion, requiereSuperAdmin, async (req, res) => {

    try {

        const { nombre, usuario, contrasena } = req.body;

        if (!nombre || !usuario) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar nombre y usuario."
            });

        }

        const [guardiaActual] = await db.query(
            `SELECT id_guardia FROM guardia WHERE id_guardia = ?`,
            [req.params.id]
        );

        if (guardiaActual.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Guardia no encontrado."
            });

        }

        // Verifica que el nuevo usuario no esté en uso por otro guardia
        const [usuarioEnUso] = await db.query(
            `SELECT id_guardia FROM guardia WHERE usuario = ? AND id_guardia != ?`,
            [usuario, req.params.id]
        );

        if (usuarioEnUso.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Ya existe otro guardia con ese usuario."
            });

        }

        if (contrasena) {

            const erroresContrasena = validarContrasena(contrasena);

            if (erroresContrasena.length > 0) {

                return res.status(400).json({
                    ok: false,
                    mensaje: `La contraseña debe tener ${erroresContrasena.join(", ")}.`
                });

            }

            const contrasenaHasheada = await bcrypt.hash(contrasena, 10);

            await db.query(

                `UPDATE guardia
                 SET nombre = ?, usuario = ?, contrasena = ?
                 WHERE id_guardia = ?`,

                [nombre, usuario, contrasenaHasheada, req.params.id]

            );

        } else {

            await db.query(

                `UPDATE guardia
                 SET nombre = ?, usuario = ?
                 WHERE id_guardia = ?`,

                [nombre, usuario, req.params.id]

            );

        }

        res.json({
            ok: true,
            mensaje: "Guardia actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR EDITANDO GUARDIA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Eliminar guardia
// DELETE /api/guardias/:id
// Solo el superadmin puede eliminar guardias
// =======================================

router.delete('/:id', requiereSesion, requiereSuperAdmin, async (req, res) => {

    try {

        const [rows] = await db.query(
            `SELECT id_guardia FROM guardia WHERE id_guardia = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Guardia no encontrado."
            });

        }

        await db.query(
            `DELETE FROM guardia WHERE id_guardia = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Guardia eliminado correctamente."
        });

    } catch (error) {

        console.error("ERROR ELIMINANDO GUARDIA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;