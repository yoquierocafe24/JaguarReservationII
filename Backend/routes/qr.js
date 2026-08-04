const express = require('express');
const router = express.Router();
const db = require('../db');
const QRCode = require("qrcode");


// =======================================
// Obtener imagen QR de una reserva
// =======================================

router.get("/:id/qr", async (req, res) => {

    try {

        // Verificar sesión
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });
        }

        // Solo los estudiantes pueden visualizar su QR
        if (req.session.usuario.rol !== "estudiante") {
            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos para ver este código QR."
            });
        }

        const { id } = req.params;

        // Buscar la reserva
        const [reservas] = await db.query(

            `SELECT
                id_reserva,
                id_estudiante,
                qr_token,
                estado,
                fecha,
                hora_fin
             FROM reservas
             WHERE id_reserva = ?`,

            [id]

        );

        if (reservas.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "La reserva no existe."
            });
        }

        const reserva = reservas[0];

        // El estudiante solo puede ver el QR
        // de sus propias reservas.
        if (
            Number(reserva.id_estudiante) !==
            Number(req.session.usuario.id)
        ) {
            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permiso para ver este código QR."
            });
        }

        // La reserva debe tener token
        if (!reserva.qr_token) {
            return res.status(404).json({
                ok: false,
                mensaje: "Esta reserva no tiene código QR."
            });
        }

        // No mostrar QR de reservas canceladas o rechazadas
        if (
            ["cancelada", "rechazada"].includes(reserva.estado)
        ) {
            return res.status(400).json({
                ok: false,
                mensaje: "El código QR ya no está disponible."
            });
        }

        // Dirección que se guardará dentro del QR
        // Esta ruta cambiará cuando el sistema esté publicado.
        // la oficial
        const enlaceRegistro =
       `https://jaguar-reservation-ii.vercel.app/usuario/unirse-reserva.html?token=${reserva.qr_token}`;
         // const enlaceRegistro =
        //`http://localhost/JaguarReservation/Frontend/usuario/unirse-reserva.html?token=${reserva.qr_token}`;

        // Generar el QR como imagen PNG
        const imagenQR = await QRCode.toBuffer(
            enlaceRegistro,
            {
                type: "png",
                width: 1000,
                margin: 4,
                errorCorrectionLevel: "H"
            }
        );

        res.setHeader("Content-Type", "image/png");
        res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        );

        return res.send(imagenQR);

    } catch (error) {

        console.error("ERROR GENERANDO QR:", error);

        return res.status(500).json({
            ok: false,
            mensaje: "No se pudo generar el código QR."
        });

    }

});

// =======================================
// Obtener información pública de la reserva
// mediante el token del código QR
// GET /api/qr/publica/:token
// =======================================

router.get("/publica/:token", async (req, res) => {

    try {

        const { token } = req.params;

        if (!token || !token.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: "El código QR no es válido."
            });
        }

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

            FROM reservas r

            INNER JOIN espacios es
                ON es.id_espacio = r.id_espacio

            LEFT JOIN inventario i
                ON i.id_item = r.id_item

            WHERE r.qr_token = ?`,

            [token.trim()]

        );

        if (reservas.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "El código QR no corresponde a una reserva válida."
            });
        }

        const reserva = reservas[0];

        if (
            reserva.estado === "cancelada" ||
            reserva.estado === "rechazada"
        ) {
            return res.status(400).json({
                ok: false,
                mensaje: "Esta reserva ya no permite registrar acompañantes."
            });
        }

       const [vigencia] = await db.query(

    `SELECT
        CASE
            WHEN fecha >
                DATE(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                )
            THEN 1

            WHEN fecha =
                DATE(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                )

            AND TIME(
                CONVERT_TZ(
                    NOW(),
                    '+00:00',
                    '-06:00'
                )
            ) <= hora_fin

            THEN 1

            ELSE 0
        END AS vigente

    FROM reservas
    WHERE id_reserva = ?`,

    [reserva.id_reserva]

);
        if (!vigencia[0]?.vigente) {
            return res.status(400).json({
                ok: false,
                mensaje: "El código QR de esta reserva ya venció."
            });
        }

        const [acompanantes] = await db.query(

            `SELECT COUNT(*) AS total
             FROM reserva_acompanantes
             WHERE id_reserva = ?
             AND confirmado = 1`,

            [reserva.id_reserva]

        );

        const totalRegistrados =
            Number(acompanantes[0]?.total || 0);

        const cuposDisponibles =
            Math.max(
                0,
                Number(reserva.cant_acompanantes || 0) -
                totalRegistrados
            );

        return res.json({
            ok: true,
            reserva: {
                id_reserva: reserva.id_reserva,
                fecha: reserva.fecha,
                hora_inicio: reserva.hora_inicio,
                hora_fin: reserva.hora_fin,
                espacio: reserva.espacio,
                juego: reserva.juego,
                cant_acompanantes:
                    Number(reserva.cant_acompanantes || 0),
                acompanantes_registrados:
                    totalRegistrados,
                cupos_disponibles:
                    cuposDisponibles
            }
        });

    } catch (error) {

        console.error(
            "ERROR CONSULTANDO RESERVA PÚBLICA:",
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje: "No se pudo consultar la información de la reserva."
        });

    }

});

// =======================================
// Registrar acompañante mediante código QR
// POST /api/qr/unirse
// =======================================

router.post("/unirse", async (req, res) => {

    let conexion;

    try {

        const {
            token,
            cuenta,
            nombre
        } = req.body;

        // =======================================
        // Validar datos recibidos
        // =======================================

        if (
            !token ||
            !String(token).trim() ||
            !cuenta ||
            !String(cuenta).trim() ||
            !nombre ||
            !String(nombre).trim()
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    "Debe ingresar su nombre completo y número de cuenta."
            });
        }

       const tokenLimpio =
         String(token).trim();

        const cuentaLimpia =
         String(cuenta).trim();

            // Normalizar el nombre para comparar
            const nombreLimpio =
            String(nombre)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

        // Validar que el nombre solo contenga letras y espacios
        const expresionNombre =
    /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;

    if (!expresionNombre.test(nombreLimpio)) {

    return res.status(400).json({
        ok: false,
        mensaje:
            "El nombre solo puede contener letras y espacios."
    });

}

        conexion = await db.getConnection();

        await conexion.beginTransaction();

        // =======================================
        // Buscar y bloquear la reserva
        // =======================================

        const [reservas] = await conexion.query(

            `SELECT
                id_reserva,
                id_estudiante,
                tipo_reserva,
                cant_acompanantes,
                estado,
                fecha,
                hora_inicio,
                hora_fin

            FROM reservas

            WHERE qr_token = ?

            FOR UPDATE`,

            [tokenLimpio]

        );

        if (reservas.length === 0) {

            await conexion.rollback();

            return res.status(404).json({
                ok: false,
                mensaje:
                    "El código QR no corresponde a una reserva válida."
            });

        }

        const reserva = reservas[0];

        // =======================================
        // Validar tipo de reserva
        // =======================================

        if (reserva.tipo_reserva !== "individual") {

            await conexion.rollback();

            return res.status(400).json({
                ok: false,
                mensaje:
                    "Este registro solamente está disponible para reservas individuales."
            });

        }

        // =======================================
        // Validar estado
        // =======================================

        if (reserva.estado !== "aprobada") {

            await conexion.rollback();

            let mensaje =
                "La reserva todavía no permite registrar acompañantes.";

            if (reserva.estado === "cancelada") {
                mensaje =
                    "La reserva fue cancelada.";
            }

            if (reserva.estado === "rechazada") {
                mensaje =
                    "La reserva fue rechazada.";
            }

            return res.status(400).json({
                ok: false,
                mensaje
            });

        }

        // =======================================
        // Validar vigencia
        // =======================================
const [vigencia] = await conexion.query(

    `SELECT
        CASE

            WHEN fecha >
                DATE(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                )
            THEN 1

            WHEN fecha =
                DATE(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                )

            AND TIME(
                CONVERT_TZ(
                    NOW(),
                    '+00:00',
                    '-06:00'
                )
            ) <= hora_fin

            THEN 1

            ELSE 0

        END AS vigente

    FROM reservas

    WHERE id_reserva = ?`,

    [reserva.id_reserva]

);

        if (!vigencia[0]?.vigente) {

            await conexion.rollback();

            return res.status(400).json({
                ok: false,
                mensaje:
                    "El código QR de esta reserva ya venció."
            });

        }

        // =======================================
        // Buscar estudiante matriculado
        // =======================================

        const [estudiantes] = await conexion.query(

            `SELECT
                id_estudiante,
                nombre,
                cuenta,
                activo

            FROM estudiantes

            WHERE cuenta = ?
            LIMIT 1`,

            [cuentaLimpia]

        );

        if (estudiantes.length === 0) {

            await conexion.rollback();

            return res.status(404).json({
                ok: false,
                mensaje:
                    "No se encontró un estudiante con ese número de cuenta."
            });

        }
        const estudiante = estudiantes[0];

// Normalizar el nombre guardado
const nombreBaseDatos =
    String(estudiante.nombre)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

// Verificar que el nombre corresponda
// al número de cuenta ingresado
if (nombreBaseDatos !== nombreLimpio) {

    await conexion.rollback();

    return res.status(400).json({
        ok: false,
        mensaje:
            "El nombre y el número de cuenta no corresponden al mismo estudiante. Verifique sus datos."
    });

}         

        if (Number(estudiante.activo) !== 1) {

            await conexion.rollback();

            return res.status(403).json({
                ok: false,
                mensaje:
                    "El estudiante no se encuentra matriculado en el periodo actual."
            });

        }

        /*
         * El nombre escrito se recibe para completar el formulario,
         * pero se utiliza el nombre guardado en Estudiantes como
         * información oficial.
         */
        if (nombreLimpio.length < 5) {

            await conexion.rollback();

            return res.status(400).json({
                ok: false,
                mensaje:
                    "Ingrese su nombre completo."
            });

        }

        // =======================================
        // Evitar que el titular se una
        // =======================================

        if (
            Number(estudiante.id_estudiante) ===
            Number(reserva.id_estudiante)
        ) {

            await conexion.rollback();

            return res.status(400).json({
                ok: false,
                mensaje:
                    "El titular ya pertenece a esta reserva."
            });

        }

// =======================================
// Validar conflicto de horario
// =======================================

const [conflictoHorario] = await conexion.query(

    `SELECT DISTINCT r.id_reserva

     FROM reservas r

     LEFT JOIN reserva_acompanantes ra
        ON ra.id_reserva = r.id_reserva

     WHERE r.fecha = ?
       AND r.estado IN ('pendiente','aprobada')
       AND r.id_reserva <> ?
       AND r.hora_inicio < ?
       AND r.hora_fin > ?
       AND (
            r.id_estudiante = ?
            OR ra.id_estudiante = ?
       )

     LIMIT 1`,

    [
        reserva.fecha,
        reserva.id_reserva,
        reserva.hora_fin,
        reserva.hora_inicio,
        estudiante.id_estudiante,
        estudiante.id_estudiante
    ]

);

if (conflictoHorario.length > 0) {

    await conexion.rollback();

    return res.status(409).json({
        ok: false,
        mensaje:
            "Ya tienes otra reserva en ese mismo horario."
    });

}

        // =======================================
        // Evitar registro duplicado
        // =======================================

        const [registroExistente] =
            await conexion.query(

                `SELECT id

                 FROM reserva_acompanantes

                 WHERE id_reserva = ?
                 AND id_estudiante = ?

                 LIMIT 1`,

                [
                    reserva.id_reserva,
                    estudiante.id_estudiante
                ]

            );

        if (registroExistente.length > 0) {

            await conexion.rollback();

            return res.status(409).json({
                ok: false,
                mensaje:
                    "Ya estás registrado como acompañante en esta reserva."
            });

        }

        // =======================================
        // Verificar cupos disponibles
        // =======================================

        const [cantidadRegistrados] =
            await conexion.query(

                `SELECT COUNT(*) AS total

                 FROM reserva_acompanantes

                 WHERE id_reserva = ?
                 AND confirmado = 1`,

                [reserva.id_reserva]

            );

        const totalRegistrados =
            Number(cantidadRegistrados[0]?.total || 0);

        const limiteAcompanantes =
            Number(reserva.cant_acompanantes || 0);

        if (totalRegistrados >= limiteAcompanantes) {

            await conexion.rollback();

            return res.status(409).json({
                ok: false,
                mensaje:
                    "Ya no hay cupos disponibles en esta reserva."
            });

        }

        // =======================================
        // Registrar acompañante
        // =======================================

        await conexion.query(

            `INSERT INTO reserva_acompanantes (
                id_reserva,
                id_estudiante,
                confirmado,
                fecha_registro,
                rol
            )
            VALUES (?, ?, 1, NOW(), ?)`,

            [
                reserva.id_reserva,
                estudiante.id_estudiante,
                "acompanante"
            ]

        );

        await conexion.commit();

        const cuposDisponibles =
            limiteAcompanantes -
            totalRegistrados -
            1;

        return res.status(201).json({
            ok: true,
            mensaje:
                "Te has unido correctamente a la reserva.",
            estudiante: {
                nombre: estudiante.nombre,
                cuenta: estudiante.cuenta
            },
            reserva: {
                id_reserva: reserva.id_reserva,
                cupos_disponibles:
                    Math.max(0, cuposDisponibles)
            }
        });

    } catch (error) {

        if (conexion) {

            try {
                await conexion.rollback();
            } catch (rollbackError) {
                console.error(
                    "ERROR REVIRTIENDO REGISTRO QR:",
                    rollbackError
                );
            }

        }

        console.error(
            "ERROR REGISTRANDO ACOMPAÑANTE:",
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                "No se pudo completar el registro en la reserva."
        });

    } finally {

        if (conexion) {
            conexion.release();
        }

    }

});``
 

module.exports = router;