const express = require('express');
const router = express.Router();
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

// =======================================
// Listar clubes, con sus integrantes
// GET /api/clubes?incluir_inactivos=true
// =======================================

router.get('/', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const incluirInactivos = req.query.incluir_inactivos === 'true';

        let consultaClubes = `
            SELECT
                c.id_club,
                c.nombre,
                c.activo
            FROM clubes c
        `;

        if (!incluirInactivos) {
            consultaClubes += ` WHERE c.activo = 1`;
        }

        consultaClubes += ` ORDER BY c.nombre ASC`;

        const [clubes] = await db.query(consultaClubes);

        if (clubes.length === 0) {

            return res.json({
                ok: true,
                clubes: []
            });

        }

        const idsClubes = clubes.map(c => c.id_club);

        const [integrantes] = await db.query(
            `SELECT
                ci.id,
                ci.id_club,
                ci.id_estudiante,
                ci.activo,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta
             FROM club_integrantes ci
             INNER JOIN estudiantes e
                ON e.id_estudiante = ci.id_estudiante
             WHERE ci.id_club IN (?)
             ORDER BY e.nombre ASC`,
            [idsClubes]
        );

        const clubesConIntegrantes = clubes.map(c => {

            const integrantesDelClub =
                integrantes.filter(i => i.id_club === c.id_club);

            return {
                ...c,
                integrantes: integrantesDelClub
            };

        });

        res.json({
            ok: true,
            clubes: clubesConIntegrantes
        });

    } catch (error) {

        console.error("ERROR LISTANDO CLUBES:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Detalle de un club, con integrantes
// GET /api/clubes/:id
// =======================================

router.get('/:id', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [clubes] = await db.query(
            `SELECT id_club, nombre, activo
             FROM clubes
             WHERE id_club = ?`,
            [req.params.id]
        );

        if (clubes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Club no encontrado."
            });

        }

        const [integrantes] = await db.query(
            `SELECT
                ci.id,
                ci.id_club,
                ci.id_estudiante,
                ci.activo,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta
             FROM club_integrantes ci
             INNER JOIN estudiantes e
                ON e.id_estudiante = ci.id_estudiante
             WHERE ci.id_club = ?
             ORDER BY e.nombre ASC`,
            [req.params.id]
        );

        res.json({
            ok: true,
            club: {
                ...clubes[0],
                integrantes
            }
        });

    } catch (error) {

        console.error("ERROR OBTENIENDO CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Crear club
// POST /api/clubes
//
// body: nombre
// =======================================

router.post('/', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { nombre } = req.body;

        if (!nombre) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el nombre del club."
            });

        }

        const [resultado] = await db.query(

            `INSERT INTO clubes(nombre, activo)
             VALUES(?,1)`,

            [nombre]

        );

        res.json({
            ok: true,
            mensaje: "Club creado correctamente.",
            id_club: resultado.insertId
        });

    } catch (error) {

        console.error("ERROR CREANDO CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Editar club (nombre)
// PUT /api/clubes/:id
// =======================================

router.put('/:id', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { nombre } = req.body;

        if (!nombre) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el nombre del club."
            });

        }

        const [clubes] = await db.query(
            `SELECT id_club FROM clubes WHERE id_club = ?`,
            [req.params.id]
        );

        if (clubes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Club no encontrado."
            });

        }

        await db.query(
            `UPDATE clubes SET nombre = ? WHERE id_club = ?`,
            [nombre, req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Club actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR EDITANDO CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Inactivar club (no se elimina)
// PUT /api/clubes/:id/inactivar
// =======================================

router.put('/:id/inactivar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [clubes] = await db.query(
            `SELECT id_club FROM clubes WHERE id_club = ?`,
            [req.params.id]
        );

        if (clubes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Club no encontrado."
            });

        }

        await db.query(
            `UPDATE clubes SET activo = 0 WHERE id_club = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Club inactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR INACTIVANDO CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Reactivar club
// PUT /api/clubes/:id/activar
// =======================================

router.put('/:id/activar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [clubes] = await db.query(
            `SELECT id_club FROM clubes WHERE id_club = ?`,
            [req.params.id]
        );

        if (clubes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Club no encontrado."
            });

        }

        await db.query(
            `UPDATE clubes SET activo = 1 WHERE id_club = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Club reactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR REACTIVANDO CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Agregar integrante a un club
// POST /api/clubes/:id/integrantes
//
// body: cuenta
//
// Reglas:
// - El club debe existir y estar activo
// - El estudiante debe existir y estar activo
// - Un estudiante no puede repetirse activo en el mismo club
//   (pero sí puede estar en otros clubes distintos)
// =======================================

router.post('/:id/integrantes', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { cuenta } = req.body;

        if (!cuenta) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar la cuenta del estudiante."
            });

        }

        const [clubes] = await db.query(
            `SELECT id_club, activo FROM clubes WHERE id_club = ?`,
            [req.params.id]
        );

        if (clubes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Club no encontrado."
            });

        }

        if (!clubes[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se pueden agregar integrantes a un club inactivo."
            });

        }

        const [estudiantes] = await db.query(
            `SELECT id_estudiante, nombre
             FROM estudiantes
             WHERE cuenta = ? AND activo = 1`,
            [cuenta]
        );

        if (estudiantes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "No se encontró un estudiante activo con esa cuenta."
            });

        }

        const estudiante = estudiantes[0];

        const [yaEnClub] = await db.query(
            `SELECT id FROM club_integrantes
             WHERE id_club = ? AND id_estudiante = ? AND activo = 1`,
            [req.params.id, estudiante.id_estudiante]
        );

        if (yaEnClub.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Ese estudiante ya es integrante activo de este club."
            });

        }

        const [resultado] = await db.query(

            `INSERT INTO club_integrantes(id_club, id_estudiante, activo)
             VALUES(?,?,1)`,

            [req.params.id, estudiante.id_estudiante]

        );

        res.json({
            ok: true,
            mensaje: "Integrante agregado correctamente.",
            id: resultado.insertId,
            estudiante_nombre: estudiante.nombre
        });

    } catch (error) {

        console.error("ERROR AGREGANDO INTEGRANTE:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Inactivar (quitar) integrante de un club
// PUT /api/clubes/:idClub/integrantes/:idIntegrante/inactivar
// =======================================

router.put('/:idClub/integrantes/:idIntegrante/inactivar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [integrantes] = await db.query(
            `SELECT id, activo
             FROM club_integrantes
             WHERE id = ? AND id_club = ?`,
            [req.params.idIntegrante, req.params.idClub]
        );

        if (integrantes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Integrante no encontrado en este club."
            });

        }

        await db.query(
            `UPDATE club_integrantes SET activo = 0 WHERE id = ?`,
            [req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Integrante retirado del club correctamente."
        });

    } catch (error) {

        console.error("ERROR RETIRANDO INTEGRANTE:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;