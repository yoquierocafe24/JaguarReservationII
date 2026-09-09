const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require("crypto");

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
            mensaje: "No tiene permisos."
        });
    }
    next();
}

// Quita acentos y pasa a minúsculas, para comparar
// nombres de deporte/espacio sin importar tildes.
// (Misma lógica usada en reservas.js para el flujo
// del estudiante; se duplica aquí a propósito, ya
// que este archivo es independiente).
function normalizarTexto(texto = '') {
    return String(texto)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// =======================================
// Generar ID de reserva (R001-2026, R002-2026...)
// Se reinicia cada año.
// Misma lógica que en reservas.js, duplicada aquí
// a propósito para mantener este archivo
// independiente (no importa nada de reservas.js).
// =======================================
async function generarIdReserva() {

    const anioActual = new Date().getFullYear();

    const [rows] = await db.query(

        `SELECT id_reserva
         FROM reservas
         WHERE id_reserva LIKE ?
         ORDER BY CAST(SUBSTRING(id_reserva, 2, 3) AS UNSIGNED) DESC
         LIMIT 1`,

        [`R%-${anioActual}`]

    );

    if (rows.length === 0) {
        return `R001-${anioActual}`;
    }

    const partes = rows[0].id_reserva.split('-');
    const ultimoNumero = parseInt(partes[0].substring(1));
    const nuevoNumero = ultimoNumero + 1;

    return `R${String(nuevoNumero).padStart(3, "0")}-${anioActual}`;
}

// =======================================
// Revisa si un estudiante ya tiene un choque
// de horario, considerando:
//   - Sus reservas personales (individuales,
//     o donde él sea el titular/líder de un
//     equipo).
//   - Cualquier reserva de EQUIPO donde sea
//     integrante activo (aunque no haya sido
//     él quien la creó).
//
// Esto evita que una misma persona quede
// "reservada" en dos lugares a la vez, sin
// importar si fue una reserva individual o
// de equipo la que generó el choque.
// =======================================
async function estudianteTieneConflictoHorario(idEstudiante, fecha, horaInicio, horaFin) {

    const [conflicto] = await db.query(

        `SELECT r.id_reserva
         FROM reservas r
         WHERE r.estado IN ('pendiente','aprobada')
         AND r.fecha = ?
         AND r.hora_inicio < ?
         AND r.hora_fin > ?
         AND (
             r.id_estudiante = ?
             OR (
                 r.tipo_reserva = 'equipo'
                 AND EXISTS (
                     SELECT 1
                     FROM equipo_integrantes ei
                     WHERE ei.id_equipo = r.id_equipo
                     AND ei.id_estudiante = ?
                     AND ei.activo = 1
                 )
             )
         )
         LIMIT 1`,

        [fecha, horaFin, horaInicio, idEstudiante, idEstudiante]
    );

    return conflicto.length > 0;
}

// =======================================
// ADMIN - Crear reserva en nombre de un
// estudiante o de un equipo
// POST /api/reservas-admin
//
// body:
//   modo: "individual" | "equipo"
//
//   -- modo individual --
//   id_estudiante  (obligatorio)
//
//   -- modo equipo --
//   id_equipo      (obligatorio)
//
//   -- siempre --
//   id_espacio, fecha, hora_inicio, hora_fin
//   id_item, telefono, solicitud_especial, cant_acompanantes (opcionales)
// =======================================

router.post('/', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const {
            modo,
            id_estudiante: idEstudianteBody,
            id_equipo,
            id_espacio,
            id_item,
            fecha,
            hora_inicio,
            hora_fin,
            telefono,
            solicitud_especial,
            cant_acompanantes
        } = req.body;

        if (!["individual", "equipo"].includes(modo)) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el modo: individual o equipo."
            });
        }

        if (!id_espacio || !fecha || !hora_inicio || !hora_fin) {
            return res.status(400).json({
                ok: false,
                mensaje: "Faltan datos obligatorios."
            });
        }

        if (solicitud_especial && solicitud_especial.length > 250) {
            return res.status(400).json({
                ok: false,
                mensaje: "La solicitud especial no puede superar los 250 caracteres."
            });
        }

        const diaSemana = new Date(fecha + "T00:00:00").getDay();
        if (diaSemana === 0) {
            return res.status(400).json({
                ok: false,
                mensaje: "No se puede reservar los domingos, el polideportivo está cerrado."
            });
        }

        // Nota de diseño: la regla de 24 horas de anticipación que
        // aplica al estudiante NO se exige aquí. Cuando la admin crea
        // la reserva directamente, se asume que ella evalúa la
        // disponibilidad real en el momento — es su criterio, no el
        // de un estudiante llenando el formulario público.

        // =======================================
        // Resolver quién queda como titular de la reserva,
        // según el modo elegido
        // =======================================

        let id_estudiante = null;
        let tipoReservaFinal = modo;
        let idEquipoFinal = null;

        if (modo === "individual") {

            if (!idEstudianteBody) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar el estudiante."
                });
            }

            const [estudiante] = await db.query(
                `SELECT * FROM estudiantes
                 WHERE id_estudiante = ?
                 AND activo = 1`,
                [idEstudianteBody]
            );

            if (estudiante.length === 0) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El estudiante no existe o está inactivo."
                });
            }

            id_estudiante = idEstudianteBody;

        } else if (modo === "equipo") {

            if (!id_equipo) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar el equipo."
                });
            }

            const [equipo] = await db.query(
                `SELECT id_equipo, deporte FROM equipos
                 WHERE id_equipo = ?
                 AND activo = 1`,
                [id_equipo]
            );

            if (equipo.length === 0) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El equipo no existe o está inactivo."
                });
            }

            // =======================================
            // Validar que el deporte del equipo coincida
            // con el espacio elegido (misma regla que ya
            // existe en el flujo del estudiante).
            // =======================================

            const [espacioReserva] = await db.query(
                `SELECT nombre FROM espacios WHERE id_espacio = ?`,
                [id_espacio]
            );

            if (espacioReserva.length === 0) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El espacio indicado no existe."
                });
            }

            const deporteEquipo = normalizarTexto(equipo[0].deporte);
            const nombreEspacio = normalizarTexto(espacioReserva[0].nombre);

            if (deporteEquipo !== nombreEspacio) {
                return res.status(400).json({
                    ok: false,
                    mensaje: `Este equipo es de ${equipo[0].deporte}, no puede reservar en ${espacioReserva[0].nombre}.`
                });
            }

            // El líder activo del equipo queda como titular de la reserva
            const [lider] = await db.query(
                `SELECT id_estudiante
                 FROM equipo_integrantes
                 WHERE id_equipo = ?
                 AND rol = 'lider'
                 AND activo = 1
                 LIMIT 1`,
                [id_equipo]
            );

            if (lider.length === 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Este equipo no tiene un líder activo asignado."
                });
            }

            id_estudiante = lider[0].id_estudiante;
            idEquipoFinal = id_equipo;

        }

        // =======================================
        // Choque de horario
        //
        // - Modo individual: se revisa solo al
        //   estudiante que hace la reserva.
        // - Modo equipo: se revisa a CADA integrante
        //   activo del equipo (líder, sublíder y
        //   jugadores), no solo al líder — así se
        //   evita que alguien quede "reservado" en
        //   dos lugares a la misma hora.
        // =======================================

        if (modo === "individual" && id_estudiante) {

            const hayConflicto = await estudianteTieneConflictoHorario(
                id_estudiante,
                fecha,
                hora_inicio,
                hora_fin
            );

            if (hayConflicto) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Ya existe una reserva en ese horario para este estudiante."
                });
            }

        } else if (modo === "equipo" && idEquipoFinal) {

            const [integrantesEquipo] = await db.query(
                `SELECT ei.id_estudiante, e.nombre
                 FROM equipo_integrantes ei
                 INNER JOIN estudiantes e ON e.id_estudiante = ei.id_estudiante
                 WHERE ei.id_equipo = ?
                 AND ei.activo = 1`,
                [idEquipoFinal]
            );

            for (const integrante of integrantesEquipo) {

                const hayConflicto = await estudianteTieneConflictoHorario(
                    integrante.id_estudiante,
                    fecha,
                    hora_inicio,
                    hora_fin
                );

                if (hayConflicto) {
                    return res.status(400).json({
                        ok: false,
                        mensaje: `${integrante.nombre} ya tiene una reserva en ese horario. No se puede reservar para el equipo.`
                    });
                }

            }

        }

        // =======================================
        // Espacios que comparten cancha física
        // =======================================

        const CANCHA_COMPARTIDA = {
            2: [2, 3],
            3: [2, 3]
        };

        const espaciosABloquear =
            CANCHA_COMPARTIDA[id_espacio] || [id_espacio];

        if (id_espacio != 4) {

            const [ocupado] = await db.query(
                `SELECT *
                 FROM reservas
                 WHERE id_espacio IN (?)
                 AND fecha = ?
                 AND estado IN ('pendiente','aprobada')
                 AND hora_inicio < ?
                 AND hora_fin > ?`,
                [espaciosABloquear, fecha, hora_fin, hora_inicio]
            );

            if (ocupado.length > 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Ese horario ya se encuentra reservado."
                });
            }

        }

        // =======================================
        // Zona Jaguar - disponibilidad de inventario
        // =======================================

        if (id_espacio == 4) {

            if (!id_item) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe seleccionar un juego."
                });
            }

            const [item] = await db.query(
                `SELECT cantidad_total
                 FROM inventario
                 WHERE id_item = ?
                 AND estado = 'activo'`,
                [id_item]
            );

            if (item.length === 0) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El juego seleccionado no está disponible."
                });
            }

            const cantidadTotal = item[0].cantidad_total;

            const [reservasDelJuego] = await db.query(
                `SELECT *
                 FROM reservas
                 WHERE id_espacio = 4
                 AND id_item = ?
                 AND fecha = ?
                 AND estado IN ('pendiente','aprobada')
                 AND hora_inicio < ?
                 AND hora_fin > ?`,
                [id_item, fecha, hora_fin, hora_inicio]
            );

            if (reservasDelJuego.length >= cantidadTotal) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Ya no hay unidades disponibles de ese juego en ese horario."
                });
            }

        }

        // =======================================
        // Crear la reserva
        // =======================================

        const id_reserva = await generarIdReserva();

        const cantidadAcompanantes = Number(cant_acompanantes) || 0;

        // El QR de acompañantes solo aplica a reservas individuales
        // de estudiantes reales (el flujo de "unirse por QR" exige
        // que el acompañante sea un estudiante matriculado, algo
        // que no aplica a equipos).
        let qr_token = null;

        if (tipoReservaFinal === "individual" && cantidadAcompanantes > 0) {
            qr_token = crypto.randomUUID();
        }

        let estado = "aprobada";

        if (id_item != null) {
            estado = "pendiente";
        }

        await db.query(
            `INSERT INTO reservas(
                id_reserva,
                id_estudiante,
                id_espacio,
                id_item,
                tipo_reserva,
                id_equipo,
                fecha,
                hora_inicio,
                hora_fin,
                telefono,
                solicitud_especial,
                cant_acompanantes,
                estado,
                qr_token
            )
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                id_reserva,
                id_estudiante,
                id_espacio,
                id_item || null,
                tipoReservaFinal,
                idEquipoFinal,
                fecha,
                hora_inicio,
                hora_fin,
                telefono || null,
                solicitud_especial || null,
                cantidadAcompanantes,
                estado,
                qr_token
            ]
        );

        res.json({
            ok: true,
            mensaje: "Reserva creada correctamente.",
            id_reserva,
            qr_token,
            tiene_qr: Boolean(qr_token)
        });

    } catch (error) {

        console.error("ERROR CREANDO RESERVA (ADMIN):", error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});


// =======================================
//  Integrantes de una reserva de equipo
// GET /api/reservas-admin/:id/equipo-integrantes
// =======================================

router.get('/:id/equipo-integrantes', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const [reservas] = await db.query(
            `SELECT id_equipo, tipo_reserva
             FROM reservas
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        if (reservas.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "Reserva no encontrada."
            });
        }

        if (reservas[0].tipo_reserva !== 'equipo') {
            return res.status(400).json({
                ok: false,
                mensaje: "Esta reserva no es de tipo equipo."
            });
        }

        const [integrantes] = await db.query(
            `SELECT
                ei.id,
                ei.id_estudiante,
                ei.rol,
                ei.activo,
                e.nombre,
                e.cuenta
             FROM equipo_integrantes ei
             INNER JOIN estudiantes e ON e.id_estudiante = ei.id_estudiante
             WHERE ei.id_equipo = ?
               AND ei.activo = 1
             ORDER BY FIELD(ei.rol,'lider','sublider','jugador'), e.nombre ASC`,
            [reservas[0].id_equipo]
        );

        res.json({
            ok: true,
            id_equipo: reservas[0].id_equipo,
            integrantes
        });

    } catch (error) {
        console.error("ERROR OBTENIENDO INTEGRANTES DE EQUIPO:", error);
        res.status(500).json({ ok: false, mensaje: "Error del servidor." });
    }

});

module.exports = router;