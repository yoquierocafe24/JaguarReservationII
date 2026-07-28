const express = require('express');
const router = express.Router();
const db = require('../db');

// =======================================
// GUARDIA
// Reservas del día
// GET /api/reservas/hoy
// =======================================

router.get('/hoy', async (req, res) => {

    try {

        if (!req.session.usuario) {
            return res.status(401).json({
                ok:false,
                mensaje:"Debe iniciar sesión."
            });
        }

        if(req.session.usuario.rol !== "guardia"){
            return res.status(403).json({
                ok:false,
                mensaje:"No tiene permisos."
            });
        }

        const [rows] = await db.query(

            `SELECT

                r.id_reserva,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.cant_acompanantes,

                e.nombre AS estudiante,

                es.nombre AS espacio

            FROM Reservas r

            INNER JOIN Estudiantes e
                ON r.id_estudiante=e.id_estudiante

            INNER JOIN Espacios es
                ON r.id_espacio=es.id_espacio

            WHERE r.fecha = CURDATE()

            ORDER BY r.hora_inicio`

        );

        res.json({
            ok:true,
            reservas:rows
        });

    } catch(error){

        console.error(error);

        res.status(500).json({
            ok:false,
            mensaje:"Error del servidor."
        });

    }

});


// =======================================
// GUARDIA - Detalle de una reserva
// GET /api/reservas/guardia/:id
// =======================================

router.get('/:id', async (req, res) => {

    try {

        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });
        }

        if (req.session.usuario.rol !== "guardia") {
            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos."
            });
        }

        // Información básica necesaria para el guardia
        const [reservas] = await db.query(

            `SELECT
                r.id_reserva,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.cant_acompanantes,

                es.nombre AS espacio,
                i.nombre AS juego

            FROM Reservas r

            INNER JOIN Espacios es
                ON es.id_espacio = r.id_espacio

            LEFT JOIN Inventario i
                ON i.id_item = r.id_item

            WHERE r.id_reserva = ?`,

            [req.params.id]
        );

        if (reservas.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "Reserva no encontrada."
            });
        }

        const reserva = reservas[0];

        // Titular y acompañantes autorizados
        const [personas] = await db.query(

            `SELECT
                lista.id_estudiante,
                lista.nombre,
                lista.cuenta,
                lista.tipo_asistencia,

                CASE
                    WHEN a.id_asistencia IS NULL THEN 0
                    ELSE 1
                END AS asistio,

                a.hora_entrada

            FROM (

                /* Titular de la reserva */
                SELECT
                    r.id_estudiante,
                    e.nombre,
                    e.cuenta,
                    'titular' AS tipo_asistencia

                FROM Reservas r

                INNER JOIN Estudiantes e
                    ON e.id_estudiante = r.id_estudiante

                WHERE r.id_reserva = ?

                UNION ALL

                /* Acompañantes registrados mediante QR */
                SELECT
                    ra.id_estudiante,
                    e.nombre,
                    e.cuenta,
                    'acompanante' AS tipo_asistencia

                FROM Reserva_Acompanantes ra

                INNER JOIN Estudiantes e
                    ON e.id_estudiante = ra.id_estudiante

                WHERE ra.id_reserva = ?
                AND ra.confirmado = 1

            ) AS lista

            LEFT JOIN Asistencia a
                ON a.id_reserva = ?
                AND a.id_estudiante = lista.id_estudiante

            ORDER BY
                CASE
                    WHEN lista.tipo_asistencia = 'titular' THEN 1
                    ELSE 2
                END,
                lista.nombre`,

            [
                req.params.id,
                req.params.id,
                req.params.id
            ]
        );

        // Saber si todavía se puede guardar asistencia
        const [vigencia] = await db.query(

            `SELECT
                CASE
                    WHEN fecha = CURDATE()
                     AND CURTIME() <= hora_fin
                     AND estado NOT IN ('cancelada', 'rechazada')
                    THEN 1
                    ELSE 0
                END AS puede_registrar

            FROM Reservas
            WHERE id_reserva = ?`,

            [req.params.id]
        );

        res.json({
            ok: true,
            reserva,
            personas,
            puede_registrar: Boolean(vigencia[0]?.puede_registrar)
        });

    } catch (error) {

        console.error("ERROR DETALLE GUARDIA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});


// =======================================
// GUARDIA - Guardar asistencia
// PUT /api/reservas/guardia/:id/asistencia
// =======================================

router.put('/:id/asistencia', async (req, res) => {

    let conexion;

    try {

        // =======================================
        // Validar sesión
        // =======================================

        if (!req.session.usuario) {

            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });

        }

        // Solo el guardia puede registrar asistencia
        if (req.session.usuario.rol !== "guardia") {

            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos."
            });

        }

        const id_reserva = req.params.id;
        const id_guardia = req.session.usuario.id;
        const { personas } = req.body;

        // =======================================
        // Validar personas seleccionadas
        // =======================================

        if (!Array.isArray(personas) || personas.length === 0) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe seleccionar al menos una persona."
            });

        }

        conexion = await db.getConnection();

        // =======================================
        // Consultar reserva y vigencia
        // =======================================

        const [reservas] = await conexion.query(

            `SELECT
                id_reserva,
                fecha,
                hora_inicio,
                hora_fin,
                estado,

                CASE
                    WHEN fecha = CURDATE() THEN 1
                    ELSE 0
                END AS es_hoy,

                CASE
                    WHEN fecha = CURDATE()
                     AND CURTIME() >= hora_inicio
                     AND CURTIME() <= hora_fin
                    THEN 1
                    ELSE 0
                END AS horario_activo

            FROM Reservas
            WHERE id_reserva = ?`,

            [id_reserva]

        );

        if (reservas.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Reserva no encontrada."
            });

        }

        const reserva = reservas[0];

        // =======================================
        // Validaciones de la reserva
        // =======================================

        if (!reserva.es_hoy) {

            return res.status(400).json({
                ok: false,
                mensaje: "La reserva no corresponde al día de hoy."
            });

        }

        if (
            reserva.estado === "cancelada" ||
            reserva.estado === "rechazada"
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "Esta reserva no permite registrar asistencia."
            });

        }

        if (!reserva.horario_activo) {

            const [horaActual] = await conexion.query(
                `SELECT CURTIME() AS hora_actual`
            );

            const ahora = horaActual[0].hora_actual;

            if (ahora < reserva.hora_inicio) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "El horario de esta reserva todavía no ha comenzado."
                });

            }

            return res.status(400).json({
                ok: false,
                mensaje: "El horario de esta reserva ya venció."
            });

        }

        // =======================================
        // Iniciar transacción
        // =======================================

        await conexion.beginTransaction();

        const tiposPermitidos = [
            "titular",
            "acompanante",
            "integrante",
            "visitante"
        ];

        let registrosNuevos = 0;

        for (const persona of personas) {

            const id_estudiante =
                Number(persona.id_estudiante);

            const tipo_asistencia =
                persona.tipo_asistencia;

            // =======================================
            // Validar datos enviados
            // =======================================

            if (
                !Number.isInteger(id_estudiante) ||
                id_estudiante <= 0 ||
                !tiposPermitidos.includes(tipo_asistencia)
            ) {

                await conexion.rollback();

                return res.status(400).json({
                    ok: false,
                    mensaje: "Hay datos de asistencia inválidos."
                });

            }

            // =======================================
            // Confirmar que pertenece a la reserva
            // =======================================

            let autorizado = false;

            if (tipo_asistencia === "titular") {

                const [titular] = await conexion.query(

                    `SELECT id_reserva
                     FROM Reservas
                     WHERE id_reserva = ?
                     AND id_estudiante = ?`,

                    [
                        id_reserva,
                        id_estudiante
                    ]

                );

                autorizado = titular.length > 0;

            } else {

                const [acompanante] = await conexion.query(

                    `SELECT id
                     FROM Reserva_Acompanantes
                     WHERE id_reserva = ?
                     AND id_estudiante = ?
                     AND confirmado = 1`,

                    [
                        id_reserva,
                        id_estudiante
                    ]

                );

                autorizado = acompanante.length > 0;

            }

            if (!autorizado) {

                await conexion.rollback();

                return res.status(403).json({
                    ok: false,
                    mensaje: "Una de las personas no pertenece a la reserva."
                });

            }

            // =======================================
            // Evitar asistencia duplicada
            // =======================================

            const [existente] = await conexion.query(

                `SELECT id_asistencia
                 FROM Asistencia
                 WHERE id_reserva = ?
                 AND id_estudiante = ?`,

                [
                    id_reserva,
                    id_estudiante
                ]

            );

            // Si ya estaba registrada, no se vuelve a insertar
            if (existente.length > 0) {
                continue;
            }

            // =======================================
            // Registrar asistencia
            // =======================================

            await conexion.query(

                `INSERT INTO Asistencia (
                    id_reserva,
                    id_estudiante,
                    tipo_asistencia,
                    hora_entrada,
                    id_guardia
                )
                VALUES (?, ?, ?, CURTIME(), ?)`,

                [
                    id_reserva,
                    id_estudiante,
                    tipo_asistencia,
                    id_guardia
                ]

            );

            registrosNuevos++;

        }

        await conexion.commit();

        if (registrosNuevos === 0) {

            return res.json({
                ok: true,
                mensaje: "Las personas seleccionadas ya tenían la asistencia registrada."
            });

        }

        res.json({
            ok: true,
            mensaje:
                registrosNuevos === 1
                    ? "Asistencia registrada correctamente."
                    : `${registrosNuevos} asistencias registradas correctamente.`
        });

    } catch (error) {

        if (conexion) {

            try {
                await conexion.rollback();
            } catch (rollbackError) {
                console.error(
                    "Error al revertir la transacción:",
                    rollbackError
                );
            }

        }

        console.error(
            "ERROR GUARDANDO ASISTENCIA:",
            error
        );

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    } finally {

        if (conexion) {
            conexion.release();
        }

    }

});

module.exports = router;