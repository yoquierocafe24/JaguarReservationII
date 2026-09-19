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

// Roles válidos para un integrante de club (igual que equipos:
// líder, sublíder, miembro). El "rol" se agregó a club_integrantes
// con: ALTER TABLE club_integrantes ADD COLUMN rol ENUM('lider',
// 'sublider','miembro') NOT NULL DEFAULT 'miembro';
const ROLES_VALIDOS = ['lider', 'sublider', 'miembro'];
const MAX_SUBLIDERES_ACTIVOS = 2;

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
                ci.rol,
                ci.activo,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta
             FROM club_integrantes ci
             INNER JOIN estudiantes e
                ON e.id_estudiante = ci.id_estudiante
             WHERE ci.id_club IN (?)
             ORDER BY
                CASE ci.rol
                    WHEN 'lider' THEN 1
                    WHEN 'sublider' THEN 2
                    ELSE 3
                END,
                e.nombre ASC`,
            [idsClubes]
        );

        const clubesConIntegrantes = clubes.map(c => {

            const integrantesDelClub =
                integrantes.filter(i => i.id_club === c.id_club);

            const lider =
                integrantesDelClub.find(i => i.rol === 'lider' && i.activo);

            return {
                ...c,
                integrantes: integrantesDelClub,
                lider_nombre: lider ? lider.estudiante_nombre : null
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
                ci.rol,
                ci.activo,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta
             FROM club_integrantes ci
             INNER JOIN estudiantes e
                ON e.id_estudiante = ci.id_estudiante
             WHERE ci.id_club = ?
             ORDER BY
                CASE ci.rol
                    WHEN 'lider' THEN 1
                    WHEN 'sublider' THEN 2
                    ELSE 3
                END,
                e.nombre ASC`,
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
// body: cuenta, rol (opcional: 'sublider' o 'miembro',
//       por defecto 'miembro'; NO se acepta 'lider' aquí
//       — para eso está el endpoint /lider/:idIntegrante)
//
// Reglas:
// - El club debe existir y estar activo
// - El estudiante debe existir y estar activo
// - Un estudiante no puede repetirse activo en el mismo club
//   (pero sí puede estar en otros clubes distintos)
// - Máximo 2 sublíderes activos por club
// =======================================

router.post('/:id/integrantes', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { cuenta } = req.body;

        const rol = req.body.rol || 'miembro';

        if (!cuenta) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar la cuenta del estudiante."
            });

        }

        if (!ROLES_VALIDOS.includes(rol)) {

            return res.status(400).json({
                ok: false,
                mensaje: "Rol inválido."
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

        if (rol === 'sublider') {

            const [sublideresActivos] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM club_integrantes
                 WHERE id_club = ? AND rol = 'sublider' AND activo = 1`,
                [req.params.id]
            );

            if (sublideresActivos[0].total >= MAX_SUBLIDERES_ACTIVOS) {

                return res.status(400).json({
                    ok: false,
                    mensaje: `Este club ya tiene el máximo de ${MAX_SUBLIDERES_ACTIVOS} sublíderes activos.`
                });

            }

        }

        // Si se agrega directamente como líder, se sigue la
        // MISMA regla que Equipos: si el club YA tiene un líder
        // activo, se rechaza y se pide usar "Hacer líder" (el
        // botón dedicado, que sí pide confirmación explícita
        // antes de degradar al líder actual). Solo se permite
        // agregar como líder directamente cuando el club todavía
        // NO tiene ninguno.
        if (rol === 'lider') {

            const [liderActivo] = await db.query(
                `SELECT id FROM club_integrantes
                 WHERE id_club = ? AND rol = 'lider' AND activo = 1`,
                [req.params.id]
            );

            if (liderActivo.length > 0) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Este club ya tiene un líder activo. Usa 'Hacer líder' para reasignarlo."
                });

            }

        }

        const [resultado] = await db.query(

            `INSERT INTO club_integrantes(id_club, id_estudiante, rol, activo)
             VALUES(?,?,?,1)`,

            [req.params.id, estudiante.id_estudiante, rol]

        );

        res.json({
            ok: true,
            mensaje:
                rol === 'lider'
                    ? "Integrante agregado correctamente como líder."
                    : "Integrante agregado correctamente.",
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
// Hacer líder a un integrante del club
// PUT /api/clubes/:idClub/lider/:idIntegrante
//
// El líder anterior (si había uno) pasa
// automáticamente a 'miembro'. Un club puede
// no tener líder (recién creado, o si el
// líder fue inactivado), así que no siempre
// hay alguien que degradar.
// =======================================

router.put('/:idClub/lider/:idIntegrante', requiereSesion, requiereAdmin, async (req, res) => {

    let conexion;

    try {

        const [clubes] = await db.query(
            `SELECT id_club, activo FROM clubes WHERE id_club = ?`,
            [req.params.idClub]
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
                mensaje: "No se puede cambiar el líder de un club inactivo."
            });

        }

        const [integrantes] = await db.query(
            `SELECT id, activo, rol
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

        if (!integrantes[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe estar activo para poder ser líder."
            });

        }

        if (integrantes[0].rol === 'lider') {

            return res.status(400).json({
                ok: false,
                mensaje: "Este integrante ya es el líder del club."
            });

        }

        conexion = await db.getConnection();
        await conexion.beginTransaction();

        // Degradar al líder anterior, si existe
        await conexion.query(
            `UPDATE club_integrantes
             SET rol = 'miembro'
             WHERE id_club = ? AND rol = 'lider' AND activo = 1`,
            [req.params.idClub]
        );

        // Asignar el nuevo líder
        await conexion.query(
            `UPDATE club_integrantes
             SET rol = 'lider'
             WHERE id = ?`,
            [req.params.idIntegrante]
        );

        await conexion.commit();

        res.json({
            ok: true,
            mensaje: "Líder del club actualizado correctamente."
        });

    } catch (error) {

        if (conexion) {
            try { await conexion.rollback(); } catch (_) {}
        }

        console.error("ERROR CAMBIANDO LÍDER DE CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    } finally {

        if (conexion) conexion.release();

    }

});

// =======================================
// Cambiar rol de un integrante (sublider <-> miembro)
// PUT /api/clubes/:idClub/integrantes/:idIntegrante/rol
//
// body: rol ('sublider' o 'miembro')
//
// No permite asignar 'lider' aquí (usar el
// endpoint dedicado /lider/:idIntegrante), ni
// cambiar el rol del líder actual (debe
// transferirse el liderazgo primero).
// =======================================

router.put('/:idClub/integrantes/:idIntegrante/rol', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { rol } = req.body;

        if (!rol || rol === 'lider' || !ROLES_VALIDOS.includes(rol)) {

            return res.status(400).json({
                ok: false,
                mensaje: "Rol inválido. Use 'sublider' o 'miembro'."
            });

        }

        const [integrantes] = await db.query(
            `SELECT id, id_club, activo, rol
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

        const integrante = integrantes[0];

        if (!integrante.activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "El integrante debe estar activo para cambiar su rol."
            });

        }

        if (integrante.rol === 'lider') {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe asignar el liderazgo a otro integrante antes de cambiar el rol del líder actual."
            });

        }

        if (rol === 'sublider' && integrante.rol !== 'sublider') {

            const [sublideresActivos] = await db.query(
                `SELECT COUNT(*) AS total
                 FROM club_integrantes
                 WHERE id_club = ? AND rol = 'sublider' AND activo = 1`,
                [req.params.idClub]
            );

            if (sublideresActivos[0].total >= MAX_SUBLIDERES_ACTIVOS) {

                return res.status(400).json({
                    ok: false,
                    mensaje: `Este club ya tiene el máximo de ${MAX_SUBLIDERES_ACTIVOS} sublíderes activos.`
                });

            }

        }

        await db.query(
            `UPDATE club_integrantes SET rol = ? WHERE id = ?`,
            [rol, req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Rol actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR CAMBIANDO ROL DE INTEGRANTE:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Inactivar (quitar) integrante de un club
// PUT /api/clubes/:idClub/integrantes/:idIntegrante/inactivar
//
// No se puede inactivar al líder actual sin
// antes transferirle el liderazgo a otro
// integrante (mismo criterio usado en Equipos).
// =======================================

router.put('/:idClub/integrantes/:idIntegrante/inactivar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [integrantes] = await db.query(
            `SELECT id, activo, rol
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

        if (integrantes[0].rol === 'lider') {

            return res.status(400).json({
                ok: false,
                mensaje: "No se puede inactivar al líder actual. Asigne el liderazgo a otro integrante primero."
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

// =======================================
// Reactivar integrante
// PUT /api/clubes/:idClub/integrantes/:idIntegrante/activar
//
// Reglas:
// - El club debe estar activo.
// - No puede quedar duplicado: si el mismo
//   estudiante ya tiene otro registro activo
//   en este club, se bloquea.
// - Vuelve a entrar como 'miembro' (no conserva
//   un rol de líder/sublíder previo, evitando
//   que se reactive con liderazgo por accidente).
// =======================================

router.put('/:idClub/integrantes/:idIntegrante/activar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [clubes] = await db.query(
            `SELECT activo FROM clubes WHERE id_club = ?`,
            [req.params.idClub]
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
                mensaje: "No se pueden reactivar integrantes de un club inactivo."
            });

        }

        const [integrantes] = await db.query(
            `SELECT id, id_estudiante, activo
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

        if (integrantes[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "Este integrante ya está activo."
            });

        }

        const [yaActivo] = await db.query(
            `SELECT id FROM club_integrantes
             WHERE id_club = ? AND id_estudiante = ? AND activo = 1`,
            [req.params.idClub, integrantes[0].id_estudiante]
        );

        if (yaActivo.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Este estudiante ya tiene otro registro activo en este club."
            });

        }

        await db.query(
            `UPDATE club_integrantes SET activo = 1, rol = 'miembro' WHERE id = ?`,
            [req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Integrante reactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR REACTIVANDO INTEGRANTE DE CLUB:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;