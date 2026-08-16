const express = require('express');
const router = express.Router();
const db = require('../db');
const { normalizarFechaISO, fechaActualHondurasISO } = require('../utils/fechas');

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
// Espacios que comparten cancha física
// (misma regla usada en reservas.js)
// =======================================

const CANCHA_COMPARTIDA = {
    2: [2, 3], // voleibol bloquea voleibol y baloncesto
    3: [2, 3]  // baloncesto bloquea voleibol y baloncesto
};

// =======================================
// Ver próximas reservas + bloqueos
// GET /api/calendario/eventos?fecha_inicio=2026-08-01&fecha_fin=2026-08-31&espacio=1
// =======================================

router.get('/eventos', requiereSesion, async (req, res) => {

    try {

        const { fecha_inicio, fecha_fin, espacio } = req.query;

        if (!fecha_inicio || !fecha_fin) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar fecha_inicio y fecha_fin."
            });

        }

        // ---------- Reservas dentro del rango ----------

        let consultaReservas = `
            SELECT
                r.id_reserva,
                r.id_espacio,
                es.nombre AS espacio_nombre,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.tipo_reserva,
                e.nombre AS estudiante_nombre
            FROM reservas r
            INNER JOIN espacios es
                ON es.id_espacio = r.id_espacio
            INNER JOIN estudiantes e
                ON e.id_estudiante = r.id_estudiante
            WHERE r.fecha BETWEEN ? AND ?
            AND r.estado IN ('pendiente','aprobada')
        `;

        const valoresReservas = [fecha_inicio, fecha_fin];

        // Un estudiante solo ve sus propias reservas en el calendario
        if (req.session.usuario.rol === "estudiante") {
            consultaReservas += ` AND r.id_estudiante = ?`;
            valoresReservas.push(req.session.usuario.id);
        }

        if (espacio) {
            consultaReservas += ` AND r.id_espacio = ?`;
            valoresReservas.push(espacio);
        }

        consultaReservas += ` ORDER BY r.fecha ASC, r.hora_inicio ASC`;

        const [reservas] = await db.query(consultaReservas, valoresReservas);

        // ---------- Bloqueos dentro del rango ----------

        let consultaBloqueos = `
            SELECT
                b.id_bloqueo,
                b.fecha_inicio,
                b.fecha_fin,
                b.hora_inicio,
                b.hora_fin,
                b.dia_completo,
                b.id_espacio,
                es.nombre AS espacio_nombre,
                b.motivo,
                b.origen
            FROM calendario_bloqueos b
            LEFT JOIN espacios es
                ON es.id_espacio = b.id_espacio
            WHERE b.fecha_inicio <= ?
            AND b.fecha_fin >= ?
        `;

        const valoresBloqueos = [fecha_fin, fecha_inicio];

        if (espacio) {
            // Un bloqueo con id_espacio NULL aplica a todos los espacios
            consultaBloqueos += ` AND (b.id_espacio = ? OR b.id_espacio IS NULL)`;
            valoresBloqueos.push(espacio);
        }

        consultaBloqueos += ` ORDER BY b.fecha_inicio ASC`;

        const [bloqueos] = await db.query(consultaBloqueos, valoresBloqueos);

        res.json({
            ok: true,
            reservas,
            bloqueos
        });

    } catch (error) {

        console.error("ERROR OBTENIENDO EVENTOS DEL CALENDARIO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Listar bloqueos
// GET /api/calendario/bloqueos?fecha_inicio=&fecha_fin=&espacio=
// =======================================

router.get('/bloqueos', requiereSesion, async (req, res) => {

    try {

        const { fecha_inicio, fecha_fin, espacio } = req.query;

        let consulta = `
            SELECT
                b.*,
                es.nombre AS espacio_nombre
            FROM calendario_bloqueos b
            LEFT JOIN espacios es
                ON es.id_espacio = b.id_espacio
            WHERE 1 = 1
        `;

        const valores = [];

        if (fecha_inicio) {
            consulta += ` AND b.fecha_fin >= ?`;
            valores.push(fecha_inicio);
        }

        if (fecha_fin) {
            consulta += ` AND b.fecha_inicio <= ?`;
            valores.push(fecha_fin);
        }

        if (espacio) {
            consulta += ` AND (b.id_espacio = ? OR b.id_espacio IS NULL)`;
            valores.push(espacio);
        }

        consulta += ` ORDER BY b.fecha_inicio ASC`;

        const [bloqueos] = await db.query(consulta, valores);

        res.json({
            ok: true,
            bloqueos
        });

    } catch (error) {

        console.error("ERROR LISTANDO BLOQUEOS:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Detalle de un bloqueo
// GET /api/calendario/bloqueos/:id
// =======================================

router.get('/bloqueos/:id', requiereSesion, async (req, res) => {

    try {

        const [rows] = await db.query(
            `SELECT
                b.*,
                es.nombre AS espacio_nombre
             FROM calendario_bloqueos b
             LEFT JOIN espacios es
                ON es.id_espacio = b.id_espacio
             WHERE b.id_bloqueo = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Bloqueo no encontrado."
            });

        }

        res.json({
            ok: true,
            bloqueo: rows[0]
        });

    } catch (error) {

        console.error("ERROR OBTENIENDO BLOQUEO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Crear bloqueo (cerrar días u horas)
// POST /api/calendario/bloqueos
//
// body:
//   fecha_inicio      (obligatorio)
//   fecha_fin         (opcional, por defecto = fecha_inicio)
//   dia_completo       1 = cierra el/los día(s) completo(s)
//                       0 = cierra solo un rango de horas
//   hora_inicio        obligatorio si dia_completo = 0
//   hora_fin           obligatorio si dia_completo = 0
//   id_espacio         opcional; si se omite, el bloqueo aplica
//                       a TODOS los espacios
//   motivo             opcional, texto libre
//   cancelar_reservas  opcional (true/false). Si hay reservas
//                       existentes que quedan dentro del bloqueo,
//                       por defecto la petición NO las cancela:
//                       devuelve la lista para que el admin decida.
//                       Si viene en true, las cancela de una vez.
// =======================================

router.post('/bloqueos', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        let {
            fecha_inicio,
            fecha_fin,
            dia_completo,
            hora_inicio,
            hora_fin,
            id_espacio,
            motivo,
            cancelar_reservas
        } = req.body;

        // ---------- Validaciones básicas ----------

        if (!fecha_inicio) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar fecha_inicio."
            });

        }

        fecha_fin = fecha_fin || fecha_inicio;

        const fechaInicioISO = normalizarFechaISO(fecha_inicio);
        const fechaFinISO = normalizarFechaISO(fecha_fin);
        const fechaActualISO = fechaActualHondurasISO();

        if (!fechaInicioISO || !fechaFinISO) {
            return res.status(400).json({
                ok: false,
                mensaje: "Las fechas enviadas no tienen un formato válido. Usa YYYY-MM-DD."
            });
        }

        if (fechaFinISO < fechaInicioISO) {

            return res.status(400).json({
                ok: false,
                mensaje: "fecha_fin no puede ser anterior a fecha_inicio."
            });

        }

        // ---------- No permitir bloqueos en fechas pasadas ----------
        if (fechaInicioISO < fechaActualISO) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se pueden crear bloqueos en fechas pasadas."
            });
        }

        fecha_inicio = fechaInicioISO;
        fecha_fin = fechaFinISO;

        // Normaliza dia_completo a booleano/entero (1 o 0)
        const esDiaCompleto = dia_completo === false || dia_completo === 0
            ? 0
            : 1;

        if (esDiaCompleto === 0) {

            if (!hora_inicio || !hora_fin) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar hora_inicio y hora_fin cuando dia_completo es falso."
                });

            }

            if (hora_fin <= hora_inicio) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "hora_fin debe ser mayor que hora_inicio."
                });

            }

        } else {

            // Si se cierra el día completo, las horas no aplican
            hora_inicio = null;
            hora_fin = null;

        }

        // Si viene id_espacio, validar que exista
        if (id_espacio) {

            const [espacioExiste] = await db.query(
                `SELECT id_espacio FROM espacios WHERE id_espacio = ?`,
                [id_espacio]
            );

            if (espacioExiste.length === 0) {

                return res.status(404).json({
                    ok: false,
                    mensaje: "El espacio indicado no existe."
                });

            }

        } else {

            id_espacio = null; // bloqueo general, aplica a todos los espacios

        }

         // ---------- Evitar bloqueos duplicados de día completo ----------

if (esDiaCompleto === 1) {

    let consultaDuplicado = `
        SELECT id_bloqueo
        FROM calendario_bloqueos
        WHERE dia_completo = 1
        AND fecha_inicio <= ?
        AND fecha_fin >= ?
    `;

    const valoresDuplicado = [
        fecha_fin,
        fecha_inicio
    ];

    if (id_espacio) {
        consultaDuplicado += `
            AND (
                id_espacio = ?
                OR id_espacio IS NULL
            )
        `;
        valoresDuplicado.push(id_espacio);
    } else {
        consultaDuplicado += `
            AND id_espacio IS NULL
        `;
    }

    consultaDuplicado += ` LIMIT 1`;

    const [bloqueosDuplicados] = await db.query(
        consultaDuplicado,
        valoresDuplicado
    );

    if (bloqueosDuplicados.length > 0) {
        return res.status(409).json({
            ok: false,
            mensaje: "Ese día o rango de fechas ya se encuentra bloqueado."
        });
    }
}

        // ---------- Buscar reservas que quedarían afectadas ----------

        const espaciosAfectados = id_espacio
            ? (CANCHA_COMPARTIDA[id_espacio] || [id_espacio])
            : null; // null = todos los espacios

        let consultaAfectadas = `
            SELECT
                r.id_reserva,
                r.id_espacio,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                e.nombre AS estudiante_nombre
            FROM reservas r
            INNER JOIN estudiantes e
                ON e.id_estudiante = r.id_estudiante
            WHERE r.fecha BETWEEN ? AND ?
            AND r.estado IN ('pendiente','aprobada')
        `;

        const valoresAfectadas = [fecha_inicio, fecha_fin];

        if (espaciosAfectados) {
            consultaAfectadas += ` AND r.id_espacio IN (?)`;
            valoresAfectadas.push(espaciosAfectados);
        }

        // Si el bloqueo es por horas específicas, solo cuentan las
        // reservas que se traslapan con ese rango de horas
        if (esDiaCompleto === 0) {
            consultaAfectadas += ` AND r.hora_inicio < ? AND r.hora_fin > ?`;
            valoresAfectadas.push(hora_fin, hora_inicio);
        }

        const [reservasAfectadas] = await db.query(consultaAfectadas, valoresAfectadas);

        // Si hay reservas afectadas y no se pidió cancelarlas, se
        // avisa al admin en vez de crear el bloqueo directamente.
        if (reservasAfectadas.length > 0 && !cancelar_reservas) {

            return res.status(409).json({
                ok: false,
                mensaje: "Hay reservas existentes en ese horario. Confirme con cancelar_reservas=true para cerrarlo de todas formas.",
                reservasAfectadas
            });

        }

        // ---------- Crear el bloqueo ----------

        const [resultado] = await db.query(

            `INSERT INTO calendario_bloqueos(
                fecha_inicio,
                fecha_fin,
                hora_inicio,
                hora_fin,
                dia_completo,
                id_espacio,
                motivo,
                origen
            )
            VALUES(?,?,?,?,?,?,?,'manual')`,

            [
                fecha_inicio,
                fecha_fin,
                hora_inicio,
                hora_fin,
                esDiaCompleto,
                id_espacio,
                motivo || null
            ]

        );

        // ---------- Cancelar reservas afectadas, si se pidió ----------

        if (reservasAfectadas.length > 0 && cancelar_reservas) {

            for (const reserva of reservasAfectadas) {

                await db.query(

                    `UPDATE reservas
                     SET
                        estado = 'cancelada',
                        cancelado_por = 'admin',
                        motivo_cancelacion = ?
                     WHERE id_reserva = ?`,

                    [
                        motivo
                            ? `Espacio/horario cerrado: ${motivo}`
                            : "Espacio/horario cerrado por administración.",
                        reserva.id_reserva
                    ]

                );

            }

        }

        res.json({
            ok: true,
            mensaje: "Bloqueo creado correctamente.",
            id_bloqueo: resultado.insertId,
            reservasCanceladas: cancelar_reservas ? reservasAfectadas.length : 0
        });

    } catch (error) {

        console.error("ERROR CREANDO BLOQUEO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// Eliminar bloqueo (reabrir día/horario)
// DELETE /api/calendario/bloqueos/:id
// =======================================

router.delete('/bloqueos/:id', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [rows] = await db.query(
            `SELECT id_bloqueo FROM calendario_bloqueos WHERE id_bloqueo = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Bloqueo no encontrado."
            });

        }

        await db.query(
            `DELETE FROM calendario_bloqueos WHERE id_bloqueo = ?`,
            [req.params.id]
        );

        res.json({
            ok: true,
            mensaje: "Bloqueo eliminado. El horario vuelve a estar disponible."
        });

    } catch (error) {

        console.error("ERROR ELIMINANDO BLOQUEO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;
