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
// ADMIN - Crear reserva en nombre de un
// estudiante, un equipo, o una persona externa
// POST /api/reservas-admin
//
// body:
//   modo: "individual" | "equipo" | "exterior"
//
//   -- modo individual --
//   id_estudiante  (obligatorio)
//
//   -- modo equipo --
//   id_equipo      (obligatorio)
//
//   -- modo exterior --
//   nombre_externo      (obligatorio)
//   documento_externo   (opcional)
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
            nombre_externo,
            documento_externo,
            id_espacio,
            id_item,
            fecha,
            hora_inicio,
            hora_fin,
            telefono,
            solicitud_especial,
            cant_acompanantes
        } = req.body;

        if (!["individual", "equipo", "exterior"].includes(modo)) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el modo: individual, equipo o exterior."
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
        let nombreExternoFinal = null;
        let documentoExternoFinal = null;

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
                `SELECT id_equipo FROM equipos
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

        } else {

            // modo === "exterior"
            // No hay estudiante ni equipo asociado. La reserva
            // queda a nombre de una persona/grupo externo a la
            // universidad. id_estudiante se guarda como NULL.

            if (!nombre_externo || !nombre_externo.trim()) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar el nombre de la persona o grupo externo."
                });
            }

            if (nombre_externo.length > 150) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "El nombre no puede superar los 150 caracteres."
                });
            }

            if (!telefono) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar un teléfono de contacto para reservas externas."
                });
            }

            nombreExternoFinal = nombre_externo.trim();
            documentoExternoFinal = documento_externo
                ? String(documento_externo).trim()
                : null;

        }

        // =======================================
        // Choque de horario del titular
        // (solo aplica si hay un id_estudiante real;
        // una reserva externa no tiene historial propio
        // que revisar en esta tabla)
        // =======================================

        if (id_estudiante) {

            const [choqueEstudiante] = await db.query(
                `SELECT *
                 FROM reservas
                 WHERE id_estudiante = ?
                 AND fecha = ?
                 AND estado IN ('pendiente','aprobada')
                 AND hora_inicio < ?
                 AND hora_fin > ?`,
                [id_estudiante, fecha, hora_fin, hora_inicio]
            );

            if (choqueEstudiante.length > 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Ya existe una reserva en ese horario para este estudiante/equipo."
                });
            }

        }

        // =======================================
        // Espacios que comparten cancha física
        // (esta validación sí aplica a los 3 modos,
        // porque depende del ESPACIO, no de quién reserva)
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
        // que el acompañante sea un estudiante matriculado, algo que
        // no aplica a equipos ni a personas externas).
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
                nombre_externo,
                documento_externo,
                fecha,
                hora_inicio,
                hora_fin,
                telefono,
                solicitud_especial,
                cant_acompanantes,
                estado,
                qr_token
            )
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                id_reserva,
                id_estudiante,
                id_espacio,
                id_item || null,
                tipoReservaFinal,
                idEquipoFinal,
                nombreExternoFinal,
                documentoExternoFinal,
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

module.exports = router;