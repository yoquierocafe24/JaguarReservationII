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

const ROLES_VALIDOS = ['lider', 'sublider', 'jugador'];

// =======================================
// Buscar estudiante activo por cuenta
// (para autocompletar el nombre al agregar integrante)
// GET /api/equipos/estudiantes/estado?cuenta=XXXX
// =======================================

router.get('/estudiantes/estado', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { cuenta } = req.query;

        if (!cuenta) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar la cuenta a buscar."
            });

        }

        const [rows] = await db.query(
            `SELECT id_estudiante, nombre, cuenta
             FROM Estudiantes
             WHERE cuenta = ? AND activo = 1`,
            [cuenta]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "No se encontró un estudiante activo con esa cuenta."
            });

        }

        res.json({
            ok: true,
            estudiante: rows[0]
        });

    } catch (error) {

        console.error("ERROR BUSCANDO ESTUDIANTE:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Listar equipos, con sus integrantes
// GET /api/equipos?incluir_inactivos=true
// =======================================

router.get('/', requiereSesion, async (req, res) => {

    try {

        const incluirInactivos = req.query.incluir_inactivos === 'true';

        let consultaEquipos = `
            SELECT
                eq.id_equipo,
                eq.nombre,
                eq.deporte,
                eq.activo
            FROM equipos eq
        `;

        if (!incluirInactivos) {
            consultaEquipos += ` WHERE eq.activo = 1`;
        }

        consultaEquipos += ` ORDER BY eq.nombre ASC`;

        const [equipos] = await db.query(consultaEquipos);

        if (equipos.length === 0) {

            return res.json({
                ok: true,
                equipos: []
            });

        }

        const idsEquipos = equipos.map(eq => eq.id_equipo);

        const [integrantes] = await db.query(
            `SELECT
                ei.id,
                ei.id_equipo,
                ei.id_estudiante,
                ei.rol,
                ei.activo,
                es.nombre AS estudiante_nombre,
                es.cuenta AS estudiante_cuenta
             FROM equipo_integrantes ei
             INNER JOIN Estudiantes es
                ON es.id_estudiante = ei.id_estudiante
             WHERE ei.id_equipo IN (?)
             ORDER BY FIELD(ei.rol,'lider','sublider','jugador'), es.nombre ASC`,
            [idsEquipos]
        );

        const equiposConIntegrantes = equipos.map(eq => {

            const integrantesDelEquipo = integrantes.filter(i => i.id_equipo === eq.id_equipo);
            const lider = integrantesDelEquipo.find(i => i.rol === 'lider' && i.activo);

            return {
                ...eq,
                lider_nombre: lider ? lider.estudiante_nombre : null,
                integrantes: integrantesDelEquipo
            };

        });

        res.json({
            ok: true,
            equipos: equiposConIntegrantes
        });

    } catch (error) {

        console.error("ERROR LISTANDO EQUIPOS:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Detalle de un equipo, con integrantes
// GET /api/equipos/:id
// =======================================

router.get('/:id', requiereSesion, async (req, res) => {

    try {

        const [equipos] = await db.query(
            `SELECT id_equipo, nombre, deporte, activo
             FROM equipos
             WHERE id_equipo = ?`,
            [req.params.id]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        const [integrantes] = await db.query(
            `SELECT
                ei.id,
                ei.id_equipo,
                ei.id_estudiante,
                ei.rol,
                ei.activo,
                es.nombre AS estudiante_nombre,
                es.cuenta AS estudiante_cuenta
             FROM equipo_integrantes ei
             INNER JOIN Estudiantes es
                ON es.id_estudiante = ei.id_estudiante
             WHERE ei.id_equipo = ?
             ORDER BY FIELD(ei.rol,'lider','sublider','jugador'), es.nombre ASC`,
            [req.params.id]
        );

        const lider = integrantes.find(i => i.rol === 'lider' && i.activo);

        res.json({
            ok: true,
            equipo: {
                ...equipos[0],
                lider_nombre: lider ? lider.estudiante_nombre : null,
                integrantes
            }
        });

    } catch (error) {

        console.error("ERROR OBTENIENDO EQUIPO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Crear equipo
// POST /api/equipos
//
// body: nombre, deporte
// (el líder ya no se define aquí; se asigna
// después agregando un integrante con rol 'lider')
// =======================================

router.post('/', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { nombre, deporte } = req.body;

        if (!nombre || !deporte) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar nombre y deporte."
            });

        }

        const [resultado] = await db.query(

            `INSERT INTO equipos(nombre, deporte, activo)
             VALUES(?,?,1)`,

            [nombre, deporte]

        );

        res.json({
            ok: true,
            mensaje: "Equipo creado correctamente. Ahora agrega a su líder desde 'Integrantes'.",
            id_equipo: resultado.insertId
        });

    } catch (error) {

        console.error("ERROR CREANDO EQUIPO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Editar equipo (nombre, deporte)
// PUT /api/equipos/:id
// =======================================

router.put('/:id', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { nombre, deporte } = req.body;

        if (!nombre || !deporte) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar nombre y deporte."
            });

        }

        const [equipos] = await db.query(
            `SELECT id_equipo FROM equipos WHERE id_equipo = ?`,
            [req.params.id]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        await db.query(
            `UPDATE equipos SET nombre = ?, deporte = ? WHERE id_equipo = ?`,
            [nombre, deporte, req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Equipo actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR EDITANDO EQUIPO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Inactivar equipo (no se elimina)
// PUT /api/equipos/:id/inactivar
// =======================================

router.put('/:id/inactivar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [equipos] = await db.query(
            `SELECT id_equipo FROM equipos WHERE id_equipo = ?`,
            [req.params.id]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        await db.query(
            `UPDATE equipos SET activo = 0 WHERE id_equipo = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Equipo inactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR INACTIVANDO EQUIPO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Reactivar equipo
// PUT /api/equipos/:id/activar
// =======================================

router.put('/:id/activar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [equipos] = await db.query(
            `SELECT id_equipo FROM equipos WHERE id_equipo = ?`,
            [req.params.id]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        await db.query(
            `UPDATE equipos SET activo = 1 WHERE id_equipo = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Equipo reactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR REACTIVANDO EQUIPO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Agregar integrante a un equipo
// POST /api/equipos/:id/integrantes
//
// body: cuenta, rol ('lider','sublider','jugador')
//
// Reglas:
// - El equipo debe existir y estar activo
// - El estudiante debe existir y estar activo
// - Un estudiante no puede repetirse activo en el mismo equipo
// - Solo puede haber 1 líder activo por equipo
// =======================================

router.post('/:id/integrantes', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { cuenta, rol } = req.body;

        if (!cuenta || !rol) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar la cuenta del estudiante y el rol."
            });

        }

        if (!ROLES_VALIDOS.includes(rol)) {

            return res.status(400).json({
                ok: false,
                mensaje: "Rol inválido. Debe ser lider, sublider o jugador."
            });

        }

        const [equipos] = await db.query(
            `SELECT id_equipo, activo FROM equipos WHERE id_equipo = ?`,
            [req.params.id]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        if (!equipos[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se pueden agregar integrantes a un equipo inactivo."
            });

        }

        const [estudiantes] = await db.query(
            `SELECT id_estudiante, nombre
             FROM Estudiantes
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

        const [yaEnEquipo] = await db.query(
            `SELECT id FROM equipo_integrantes
             WHERE id_equipo = ? AND id_estudiante = ? AND activo = 1`,
            [req.params.id, estudiante.id_estudiante]
        );

        if (yaEnEquipo.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Ese estudiante ya es integrante activo de este equipo."
            });

        }

        if (rol === 'lider') {

            const [liderActivo] = await db.query(
                `SELECT id FROM equipo_integrantes
                 WHERE id_equipo = ? AND rol = 'lider' AND activo = 1`,
                [req.params.id]
            );

            if (liderActivo.length > 0) {

                return res.status(409).json({
                    ok: false,
                    mensaje: "Este equipo ya tiene un líder activo. Usa 'Cambiar líder' para reasignarlo."
                });

            }

        }

        const [resultado] = await db.query(

            `INSERT INTO equipo_integrantes(id_equipo, id_estudiante, rol, activo)
             VALUES(?,?,?,1)`,

            [req.params.id, estudiante.id_estudiante, rol]

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
// Cambiar rol de un integrante
// (solo entre sublider y jugador; para pasar
// a alguien a líder se usa el endpoint dedicado,
// que también degrada al líder anterior)
// PUT /api/equipos/:idEquipo/integrantes/:idIntegrante/rol
//
// body: rol ('sublider','jugador')
// =======================================

router.put('/:idEquipo/integrantes/:idIntegrante/rol', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const { rol } = req.body;

        if (!rol || !['sublider', 'jugador'].includes(rol)) {

            return res.status(400).json({
                ok: false,
                mensaje: "Rol inválido. Para asignar líder usa el endpoint de cambio de líder."
            });

        }

        const [integrantes] = await db.query(
            `SELECT id, id_equipo, rol, activo
             FROM equipo_integrantes
             WHERE id = ? AND id_equipo = ?`,
            [req.params.idIntegrante, req.params.idEquipo]
        );

        if (integrantes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Integrante no encontrado en este equipo."
            });

        }

        if (integrantes[0].rol === 'lider') {

            return res.status(400).json({
                ok: false,
                mensaje: "Este integrante es el líder actual. Usa 'Cambiar líder' para reemplazarlo antes de cambiar su rol."
            });

        }

        await db.query(
            `UPDATE equipo_integrantes SET rol = ? WHERE id = ?`,
            [rol, req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Rol actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR CAMBIANDO ROL:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Cambiar líder de un equipo
// (degrada al líder anterior a jugador,
// promueve al integrante indicado)
// PUT /api/equipos/:idEquipo/lider/:idIntegrante
// =======================================

router.put('/:idEquipo/lider/:idIntegrante', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [equipos] = await db.query(
            `SELECT id_equipo FROM equipos WHERE id_equipo = ?`,
            [req.params.idEquipo]
        );

        if (equipos.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Equipo no encontrado."
            });

        }

        const [nuevoLider] = await db.query(
            `SELECT id, id_estudiante, activo
             FROM equipo_integrantes
             WHERE id = ? AND id_equipo = ?`,
            [req.params.idIntegrante, req.params.idEquipo]
        );

        if (nuevoLider.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Integrante no encontrado en este equipo."
            });

        }

        if (!nuevoLider[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se puede asignar como líder a un integrante inactivo."
            });

        }

        // Degrada al líder activo actual (si existe) a jugador
        await db.query(
            `UPDATE equipo_integrantes
             SET rol = 'jugador'
             WHERE id_equipo = ? AND rol = 'lider' AND activo = 1`,
            [req.params.idEquipo]
        );

        // Promueve al nuevo líder
        await db.query(
            `UPDATE equipo_integrantes SET rol = 'lider' WHERE id = ?`,
            [req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Líder actualizado correctamente."
        });

    } catch (error) {

        console.error("ERROR CAMBIANDO LÍDER:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Inactivar integrante
// PUT /api/equipos/:idEquipo/integrantes/:idIntegrante/inactivar
//
// Si es el líder activo, se debe asignar un
// nuevo líder antes de poder inactivarlo.
// =======================================

router.put('/:idEquipo/integrantes/:idIntegrante/inactivar', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [integrantes] = await db.query(
            `SELECT id, rol, activo
             FROM equipo_integrantes
             WHERE id = ? AND id_equipo = ?`,
            [req.params.idIntegrante, req.params.idEquipo]
        );

        if (integrantes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Integrante no encontrado en este equipo."
            });

        }

        if (integrantes[0].rol === 'lider' && integrantes[0].activo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No puedes inactivar al líder actual. Asigna un nuevo líder primero."
            });

        }

        await db.query(
            `UPDATE equipo_integrantes SET activo = 0 WHERE id = ?`,
            [req.params.idIntegrante]
        );

        res.json({
            ok: true,
            mensaje: "Integrante inactivado correctamente."
        });

    } catch (error) {

        console.error("ERROR INACTIVANDO INTEGRANTE:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;