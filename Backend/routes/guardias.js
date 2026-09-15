const express = require('express');
const router = express.Router();
const db = require('../db');

// =======================================
// Middlewares de ayuda (sesión / rol guardia)
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

function requiereGuardia(req, res, next) {
    if (req.session.usuario.rol !== "guardia") {
        return res.status(403).json({
            ok: false,
            mensaje: "No tiene permisos."
        });
    }
    next();
}

// Fecha/hora de Honduras reutilizable en las queries
const FECHA_HN = `DATE(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`;
const HORA_HN = `TIME(CONVERT_TZ(NOW(), '+00:00', '-06:00'))`;

// =======================================
// GUARDIA
// Reservas del día
// GET /api/guardias/hoy
// =======================================

router.get('/hoy', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const [rows] = await db.query(

            `SELECT

                r.id_reserva,
                r.id_estudiante,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.cant_acompanantes,
                r.tipo_reserva,
                r.id_equipo,

                e.nombre AS estudiante,

                es.nombre AS espacio,

                (
                    SELECT COUNT(*)
                    FROM equipo_integrantes ei
                    WHERE ei.id_equipo = r.id_equipo
                      AND ei.activo = 1
                ) AS cantidad_equipo

            FROM reservas r

            INNER JOIN estudiantes e
                ON r.id_estudiante=e.id_estudiante

            INNER JOIN espacios es
                ON r.id_espacio=es.id_espacio

            WHERE r.fecha = ${FECHA_HN}
            AND r.estado = 'aprobada'
            

            ORDER BY

    /* Primero: reservas con horario activo */
    CASE
        WHEN ${HORA_HN} >= r.hora_inicio
         AND ${HORA_HN} <= r.hora_fin
        THEN 1

        /* Segundo: reservas que aún no comienzan */
        WHEN ${HORA_HN} < r.hora_inicio
        THEN 2

        /* Tercero: reservas ya vencidas */
        ELSE 3
    END,

    /* Activas y próximas: la hora más cercana primero */
    CASE
        WHEN ${HORA_HN} <= r.hora_fin
        THEN r.hora_inicio
    END ASC,

    /* Vencidas: la más reciente primero */
    CASE
        WHEN ${HORA_HN} > r.hora_fin
        THEN r.hora_fin
    END DESC`

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
// GUARDIA - Buscar persona por cuenta
// GET /api/guardias/buscar?cuenta=...
// Busca titulares, acompañantes e
// integrantes de equipo del día
// =======================================

router.get('/buscar', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const cuenta =
            String(req.query.cuenta || "").trim();

        if (!cuenta) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debe ingresar un número de cuenta."
            });
        }

        // Validar formato de cuenta
        if (!/^\d+$/.test(cuenta)) {
            return res.status(400).json({
                ok: false,
                mensaje: "El número de cuenta solo debe contener números."
            });
        }

        const [rows] = await db.query(

            `SELECT
                persona.id_reserva,
                persona.fecha,
                persona.hora_inicio,
                persona.hora_fin,
                persona.estado,
                persona.cant_acompanantes,

                persona.id_estudiante,
                persona.nombre,
                persona.cuenta,
                persona.tipo_asistencia,

                es.nombre AS espacio,

                /* Indica si ya registró asistencia */
                CASE
                    WHEN a.id_asistencia IS NULL THEN 0
                    ELSE 1
                END AS asistio,

                a.hora_entrada,

                /* Indica si la reserva está en su horario */
                CASE
                    WHEN persona.fecha = ${FECHA_HN}
                     AND ${HORA_HN} >= persona.hora_inicio
                     AND ${HORA_HN} <= persona.hora_fin
                    THEN 1
                    ELSE 0
                END AS horario_activo

            FROM (

                /* Buscar como titular */
                SELECT
                    r.id_reserva,
                    r.id_espacio,
                    r.fecha,
                    r.hora_inicio,
                    r.hora_fin,
                    r.estado,
                    r.cant_acompanantes,

                    titular.id_estudiante,
                    titular.nombre,
                    titular.cuenta,

                    'titular' AS tipo_asistencia

                FROM reservas r

                INNER JOIN estudiantes titular
                    ON titular.id_estudiante =
                       r.id_estudiante

                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND titular.cuenta = ?

                UNION ALL

                /* Buscar como acompañante */
                SELECT
                    r.id_reserva,
                    r.id_espacio,
                    r.fecha,
                    r.hora_inicio,
                    r.hora_fin,
                    r.estado,
                    r.cant_acompanantes,

                    acompanante.id_estudiante,
                    acompanante.nombre,
                    acompanante.cuenta,

                    'acompanante' AS tipo_asistencia

                FROM reservas r

                INNER JOIN reserva_acompanantes ra
                    ON ra.id_reserva = r.id_reserva
                    AND ra.confirmado = 1

                INNER JOIN estudiantes acompanante
                    ON acompanante.id_estudiante =
                       ra.id_estudiante

                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND acompanante.cuenta = ?

                UNION ALL

                /* Buscar como integrante de un equipo
                   (se excluye al líder porque ya aparece
                   arriba como 'titular') */
                SELECT
                    r.id_reserva,
                    r.id_espacio,
                    r.fecha,
                    r.hora_inicio,
                    r.hora_fin,
                    r.estado,
                    r.cant_acompanantes,

                    integrante.id_estudiante,
                    integrante.nombre,
                    integrante.cuenta,

                    'integrante' AS tipo_asistencia

                FROM reservas r

                INNER JOIN equipo_integrantes ei
                    ON ei.id_equipo = r.id_equipo
                    AND ei.activo = 1

                INNER JOIN estudiantes integrante
                    ON integrante.id_estudiante =
                       ei.id_estudiante

                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND r.tipo_reserva = 'equipo'
                AND integrante.cuenta = ?
                AND ei.id_estudiante <> r.id_estudiante

            ) AS persona

            INNER JOIN espacios es
                ON es.id_espacio =
                   persona.id_espacio

            LEFT JOIN asistencia a
                ON a.id_reserva =
                   persona.id_reserva
                AND a.id_estudiante =
                    persona.id_estudiante

          ORDER BY

    /* 1. Reservas activas */
    CASE
        WHEN ${HORA_HN} >= persona.hora_inicio
         AND ${HORA_HN} <= persona.hora_fin
        THEN 1

        /* 2. Reservas próximas */
        WHEN ${HORA_HN} < persona.hora_inicio
        THEN 2

        /* 3. Reservas vencidas */
        ELSE 3
    END,

    /* Activas y próximas: la más cercana primero */
    CASE
        WHEN ${HORA_HN} <= persona.hora_fin
        THEN persona.hora_inicio
    END ASC,

    /* Vencidas: la más reciente primero */
    CASE
        WHEN ${HORA_HN} > persona.hora_fin
        THEN persona.hora_fin
    END DESC`,

            [
                cuenta,
                cuenta,
                cuenta
            ]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "No se encontró una persona autorizada con ese número de cuenta para las reservas de hoy."
            });
        }

        return res.json({
            ok: true,
            total: rows.length,

            // Se conserva el nombre "reservas"
            // para no romper el frontend actual
            reservas: rows
        });

    } catch (error) {

        console.error(
            "ERROR BUSCANDO PERSONA POR CUENTA:",
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });
    }

});

// =======================================
// GUARDIA - Listar espacios
// (para el selector del modal de visitantes)
// GET /api/guardias/espacios
//
// IMPORTANTE: esta ruta (y /buscar-estudiante)
// deben ir ANTES de '/:id' — si no, Express las
// interpreta como si "espacios" fuera un id_reserva.
// =======================================

router.get('/espacios', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const [espacios] = await db.query(
            `SELECT id_espacio, nombre
             FROM espacios
             ORDER BY nombre ASC`
        );

        res.json({
            ok: true,
            espacios
        });

    } catch (error) {

        console.error("ERROR LISTANDO ESPACIOS:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// GUARDIA - Buscar estudiante (cuenta o nombre)
// Sin importar si tiene o no reserva hoy.
// Se usa para ofrecer "Registrar visita" a
// quien no aparece en /buscar.
// GET /api/guardias/buscar-estudiante?q=...
// =======================================

router.get('/buscar-estudiante', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const q = String(req.query.q || "").trim();

        if (!q) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar un nombre o número de cuenta."
            });
        }

        const [estudiantes] = await db.query(

            `SELECT id_estudiante, nombre, cuenta
             FROM estudiantes
             WHERE activo = 1
             AND (cuenta = ? OR nombre LIKE ?)
             ORDER BY nombre ASC
             LIMIT 8`,

            [q, `%${q}%`]

        );

        res.json({
            ok: true,
            estudiantes
        });

    } catch (error) {

        console.error("ERROR BUSCANDO ESTUDIANTE (GUARDIA):", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// GUARDIA - Consultar si hoy es domingo
// (usa la hora de Honduras del servidor,
// no la del navegador del guardia)
// GET /api/guardias/es-domingo
// =======================================

router.get('/es-domingo', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const [rows] = await db.query(
            `SELECT DAYOFWEEK(${FECHA_HN}) AS dia`
        );

        // DAYOFWEEK: 1 = domingo
        const esDomingo = rows[0].dia === 1;

        res.json({
            ok: true,
            es_domingo: esDomingo
        });

    } catch (error) {

        console.error("ERROR CONSULTANDO SI ES DOMINGO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

// =======================================
// GUARDIA - Detalle de una reserva
// GET /api/guardias/:id
// =======================================

router.get('/:id', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        // Información básica necesaria para el guardia
        const [reservas] = await db.query(

            `SELECT
                r.id_reserva,
                r.id_estudiante,
                r.tipo_reserva,
                r.id_equipo,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.cant_acompanantes,

                es.nombre AS espacio,
                i.nombre AS juego

            FROM reservas r

            INNER JOIN espacios es
                ON es.id_espacio = r.id_espacio

            LEFT JOIN inventario i
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

        let personas;

        if (reserva.tipo_reserva === 'equipo') {

            // =======================================
            // RESERVA DE EQUIPO
            // El líder/sublíder que reservó = "titular"
            // (coincide con reserva.id_estudiante).
            // El resto de integrantes activos = "integrante".
            // =======================================

            const [filas] = await db.query(

                `SELECT
                    ei.id_estudiante,
                    e.nombre,
                    e.cuenta,

                    CASE
                        WHEN ei.id_estudiante = ? THEN 'titular'
                        ELSE 'integrante'
                    END AS tipo_asistencia,

                    CASE
                        WHEN a.id_asistencia IS NULL THEN 0
                        ELSE 1
                    END AS asistio,

                    a.hora_entrada

                FROM equipo_integrantes ei

                INNER JOIN estudiantes e
                    ON e.id_estudiante = ei.id_estudiante

                LEFT JOIN asistencia a
                    ON a.id_reserva = ?
                    AND a.id_estudiante = ei.id_estudiante

                WHERE ei.id_equipo = ?
                  AND ei.activo = 1

                ORDER BY
                    CASE
                        WHEN ei.id_estudiante = ? THEN 1
                        ELSE 2
                    END,
                    e.nombre`,

                [
                    reserva.id_estudiante,
                    req.params.id,
                    reserva.id_equipo,
                    reserva.id_estudiante
                ]
            );

            personas = filas;

        } else {

            // =======================================
            // RESERVA INDIVIDUAL (comportamiento original)
            // =======================================

            const [filas] = await db.query(

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

                    FROM reservas r

                    INNER JOIN estudiantes e
                        ON e.id_estudiante = r.id_estudiante

                    WHERE r.id_reserva = ?

                    UNION ALL

                    /* Acompañantes registrados mediante QR */
                    SELECT
                        ra.id_estudiante,
                        e.nombre,
                        e.cuenta,
                        'acompanante' AS tipo_asistencia

                    FROM reserva_acompanantes ra

                    INNER JOIN estudiantes e
                        ON e.id_estudiante = ra.id_estudiante

                    WHERE ra.id_reserva = ?
                    AND ra.confirmado = 1

                ) AS lista

                LEFT JOIN asistencia a
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

            personas = filas;
        }

        const [vigencia] = await db.query(

    `SELECT
        CASE
            WHEN fecha = ${FECHA_HN}

             AND ${HORA_HN} BETWEEN hora_inicio AND hora_fin

             AND estado NOT IN ('cancelada', 'rechazada')

            THEN 1
            ELSE 0
        END AS puede_registrar

    FROM reservas
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
// PUT /api/guardias/:id/asistencia
// =======================================

router.put('/:id/asistencia', requiereSesion, requiereGuardia, async (req, res) => {

    let conexion;

    try {

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
        id_estudiante,
        tipo_reserva,
        id_equipo,
        fecha,
        hora_inicio,
        hora_fin,
        estado,

        CASE
            WHEN fecha = ${FECHA_HN}
            THEN 1
            ELSE 0
        END AS es_hoy,

        CASE
            WHEN fecha = ${FECHA_HN}

             AND ${HORA_HN} >= hora_inicio

             AND ${HORA_HN} <= hora_fin

            THEN 1
            ELSE 0
        END AS horario_activo

    FROM reservas
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
                `SELECT ${HORA_HN} AS hora_actual`
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
                     FROM reservas
                     WHERE id_reserva = ?
                     AND id_estudiante = ?`,

                    [
                        id_reserva,
                        id_estudiante
                    ]

                );

                autorizado = titular.length > 0;

            } else if (tipo_asistencia === "integrante") {

                // Solo válido si la reserva es de tipo equipo.
                // Se verifica que el estudiante sea integrante
                // activo del equipo dueño de esta reserva.

                if (reserva.tipo_reserva !== 'equipo' || !reserva.id_equipo) {

                    await conexion.rollback();

                    return res.status(400).json({
                        ok: false,
                        mensaje: "Esta reserva no es de tipo equipo."
                    });

                }

                const [integrante] = await conexion.query(

                    `SELECT id
                     FROM equipo_integrantes
                     WHERE id_equipo = ?
                     AND id_estudiante = ?
                     AND activo = 1`,

                    [
                        reserva.id_equipo,
                        id_estudiante
                    ]

                );

                autorizado = integrante.length > 0;

            } else {

                // "acompanante" / "visitante"
                const [acompanante] = await conexion.query(

                    `SELECT id
                     FROM reserva_acompanantes
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
                 FROM asistencia
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

                `INSERT INTO asistencia (
                    id_reserva,
                    id_estudiante,
                    tipo_asistencia,
                    hora_entrada,
                    id_guardia
                )
                VALUES (?, ?, ?, ${HORA_HN}, ?)`,

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

// =======================================
// GUARDIA - Registrar visita sin reserva
// (ej: alguien que solo quiere entrar a
// Zona Jaguar, fútbol, etc. sin haber reservado)
// POST /api/guardias/visitante
//
// body: id_estudiante, id_espacio
// =======================================


router.post('/visitante', requiereSesion, requiereGuardia, async (req, res) => {

    try {

        const id_guardia = req.session.usuario.id;
        const id_estudiante = Number(req.body.id_estudiante);
        const id_espacio = Number(req.body.id_espacio);

        if (
            !Number.isInteger(id_estudiante) || id_estudiante <= 0 ||
            !Number.isInteger(id_espacio) || id_espacio <= 0
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el estudiante y el espacio."
            });

        }

        // =======================================
        // Regla: los domingos el polideportivo
        // está cerrado, no se puede registrar
        // ningún acceso libre.
        // =======================================

        const [diaActual] = await db.query(
            `SELECT DAYOFWEEK(${FECHA_HN}) AS dia`
        );

        // DAYOFWEEK: 1 = domingo
        if (diaActual[0].dia === 1) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se puede registrar acceso libre los domingos, el polideportivo está cerrado."
            });

        }

        const [estudiantes] = await db.query(
            `SELECT id_estudiante, nombre
             FROM estudiantes
             WHERE id_estudiante = ? AND activo = 1`,
            [id_estudiante]
        );

        if (estudiantes.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Estudiante no encontrado o inactivo."
            });

        }

        const [espacios] = await db.query(
            `SELECT id_espacio, nombre
             FROM espacios
             WHERE id_espacio = ?`,
            [id_espacio]
        );

        if (espacios.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Espacio no encontrado."
            });

        }

        // =======================================
        // REGLA DE ORO: no se puede registrar
        // acceso libre si el estudiante YA está
        // ahora mismo dentro del horario de otra
        // reserva aprobada (como titular,
        // acompañante o integrante de equipo).
        // =======================================

        const [reservaActiva] = await db.query(

            `SELECT
                r.id_reserva,
                es.nombre AS espacio,
                r.hora_inicio,
                r.hora_fin

            FROM (

                /* Como titular */
                SELECT r.id_reserva, r.id_espacio, r.hora_inicio, r.hora_fin
                FROM reservas r
                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND r.id_estudiante = ?

                UNION ALL

                /* Como acompañante */
                SELECT r.id_reserva, r.id_espacio, r.hora_inicio, r.hora_fin
                FROM reservas r
                INNER JOIN reserva_acompanantes ra
                    ON ra.id_reserva = r.id_reserva
                    AND ra.confirmado = 1
                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND ra.id_estudiante = ?

                UNION ALL

                /* Como integrante de equipo */
                SELECT r.id_reserva, r.id_espacio, r.hora_inicio, r.hora_fin
                FROM reservas r
                INNER JOIN equipo_integrantes ei
                    ON ei.id_equipo = r.id_equipo
                    AND ei.activo = 1
                WHERE r.fecha = ${FECHA_HN}
                AND r.estado = 'aprobada'
                AND r.tipo_reserva = 'equipo'
                AND ei.id_estudiante = ?

            ) AS r

            INNER JOIN espacios es
                ON es.id_espacio = r.id_espacio

            WHERE ${HORA_HN} BETWEEN r.hora_inicio AND r.hora_fin

            LIMIT 1`,

            [id_estudiante, id_estudiante, id_estudiante]

        );

        if (reservaActiva.length > 0) {

            const activa = reservaActiva[0];

            return res.status(409).json({
                ok: false,
                mensaje:
                    `Este estudiante ya tiene una reserva activa en ` +
                    `${activa.espacio} (${String(activa.hora_inicio).substring(0,5)} - ` +
                    `${String(activa.hora_fin).substring(0,5)}). No puede registrar ` +
                    `acceso libre mientras esa reserva esté vigente.`
            });

        }

        // =======================================
        // Evitar doble registro el mismo día en
        // el mismo espacio (sí puede entrar a
        // espacios distintos el mismo día).
        // =======================================

        const [yaRegistrado] = await db.query(
            `SELECT id_asistencia
             FROM asistencia
             WHERE id_estudiante = ?
             AND id_espacio = ?
             AND tipo_ingreso = 'libre'
             AND fecha_entrada = ${FECHA_HN}`,
            [id_estudiante, id_espacio]
        );

        if (yaRegistrado.length > 0) {

            return res.status(409).json({
                ok: false,
                mensaje: "Este estudiante ya registró acceso libre a ese espacio hoy."
            });

        }

        await db.query(

            `INSERT INTO asistencia(
                id_reserva,
                id_estudiante,
                id_espacio,
                tipo_asistencia,
                hora_entrada,
                id_guardia,
                tipo_ingreso,
                origen,
                fecha_entrada
            )
            VALUES(NULL, ?, ?, 'visitante', ${HORA_HN}, ?, 'libre', 'guardia', ${FECHA_HN})`,

            [id_estudiante, id_espacio, id_guardia]

        );

        res.json({
            ok: true,
            mensaje: `Visita registrada: ${estudiantes[0].nombre} — ${espacios[0].nombre}.`
        });

    } catch (error) {

        console.error("ERROR REGISTRANDO VISITA:", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});



module.exports = router;