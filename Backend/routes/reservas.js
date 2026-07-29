const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require("crypto");

// =======================================
// Generar ID de reserva (R001-2026, R002-2026...)
// Se reinicia cada año
// =======================================
async function generarIdReserva() {

    // Año actual completo, ej: 2026
    const anioActual = new Date().getFullYear();

    // Busca el último id_reserva generado ESTE año
    const [rows] = await db.query(

        `SELECT id_reserva
         FROM Reservas
         WHERE id_reserva LIKE ?
         ORDER BY CAST(SUBSTRING(id_reserva, 2, 3) AS UNSIGNED) DESC
         LIMIT 1`,

        [`R%-${anioActual}`]

    );

    if (rows.length === 0) {
        return `R001-${anioActual}`;
    }

    // Extrae el número, ej: "R047-2026" -> 47
    const partes = rows[0].id_reserva.split('-');
    const ultimoNumero = parseInt(partes[0].substring(1));
    const nuevoNumero = ultimoNumero + 1;

    return `R${String(nuevoNumero).padStart(3, "0")}-${anioActual}`;
}

// =======================================
// Crear Reserva
// POST /api/reservas
// =======================================

router.post('/', async (req, res) => {

    try {

        // Verificar sesión
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });
        }

        // Solo estudiantes pueden reservar
        if (req.session.usuario.rol !== "estudiante") {
            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos para realizar reservas."
            });
        }

        // El id del estudiante sale de la sesión
        const id_estudiante = req.session.usuario.id;

        const {

            id_espacio,
            id_item,
            tipo_reserva,
            id_equipo,
            fecha,
            hora_inicio,
            hora_fin,
            telefono,
            solicitud_especial,
            cant_acompanantes

        } = req.body;

        // Validación de datos obligatorios
        if (!id_espacio || !fecha || !hora_inicio || !hora_fin) {

            return res.status(400).json({
                ok: false,
                mensaje: "Faltan datos obligatorios."
            });

        }

        // =======================================
        // Regla: domingos bloqueados (la U no abre)
        // =======================================

        const diaSemana = new Date(fecha + "T00:00:00").getDay();
        // getDay() → 0 = domingo

        if (diaSemana === 0) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se puede reservar los domingos, el polideportivo está cerrado."
            });

        }

        // Validar estudiante

        const [estudiante] = await db.query(

            `SELECT * FROM Estudiantes
             WHERE id_estudiante = ?
             AND activo = 1`,

            [id_estudiante]

        );

        if (estudiante.length === 0) {

            return res.status(404).json({

                ok: false,
                mensaje: "El estudiante no existe o está inactivo."

            });

        }

        // =======================================
        // Regla: el mismo estudiante no puede tener
        // otra reserva (en cualquier espacio) que
        // se traslape con este horario
        // =======================================

        const [choqueEstudiante] = await db.query(

            `SELECT *
             FROM Reservas
             WHERE id_estudiante = ?
             AND fecha = ?
             AND estado IN ('pendiente','aprobada')
             AND hora_inicio < ?
             AND hora_fin > ?`,

            [
                id_estudiante,
                fecha,
                hora_fin,
                hora_inicio
            ]

        );

        if (choqueEstudiante.length > 0) {

            return res.status(400).json({
                ok: false,
                mensaje: "Ya tienes una reserva en ese horario. No puedes tener dos reservas al mismo tiempo."
            });

        }

        // =======================================
        // Espacios que comparten cancha física:
        // Voleibol (2) y Baloncesto (3)
        // Si se reserva uno, se bloquea el otro
        // en el mismo horario.
        // =======================================

        const CANCHA_COMPARTIDA = {
            2: [2, 3], // voleibol bloquea voleibol y baloncesto
            3: [2, 3]  // baloncesto bloquea voleibol y baloncesto
        };

        const espaciosABloquear =
            CANCHA_COMPARTIDA[id_espacio] || [id_espacio];

        // =======================================
        // Regla: horario ocupado
        // - Fútbol / Voleibol / Baloncesto: bloquea
        //   el espacio (o los compartidos) por completo.
        // - Zona Jaguar (4): NO bloquea por horario,
        //   se valida por disponibilidad de inventario
        //   más abajo.
        // =======================================

        if (id_espacio != 4) {

            const [ocupado] = await db.query(

                `SELECT *
                 FROM Reservas
                 WHERE id_espacio IN (?)
                 AND fecha = ?
                 AND estado IN ('pendiente','aprobada')
                 AND hora_inicio < ?
                 AND hora_fin > ?`,

                [
                    espaciosABloquear,
                    fecha,
                    hora_fin,
                    hora_inicio
                ]

            );

            if (ocupado.length > 0) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Ese horario ya se encuentra reservado."
                });

            }

        }

        // =======================================
        // Regla: Zona Jaguar - validar disponibilidad
        // de inventario para el juego seleccionado
        // =======================================

        if (id_espacio == 4) {

            if (!id_item) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe seleccionar un juego."
                });

            }

            // Cantidad total de ese juego en inventario
            const [item] = await db.query(

                `SELECT cantidad_total
                 FROM Inventario
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

            // Cuántas reservas ya existen para ese mismo
            // juego, en esa misma fecha y horario
            const [reservasDelJuego] = await db.query(

                `SELECT *
                 FROM Reservas
                 WHERE id_espacio = 4
                 AND id_item = ?
                 AND fecha = ?
                 AND estado IN ('pendiente','aprobada')
                 AND hora_inicio < ?
                 AND hora_fin > ?`,

                [
                    id_item,
                    fecha,
                    hora_fin,
                    hora_inicio
                ]

            );

            if (reservasDelJuego.length >= cantidadTotal) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Ya no hay unidades disponibles de ese juego en ese horario."
                });

            }

        }

        // Crear ID

        const id_reserva = await generarIdReserva();

       // =======================================
// Generar el token para el código QR
// =======================================

// Convierte la cantidad de acompañantes a número.
// Si viene vacío o nulo, toma el valor 0.
const cantidadAcompanantes =
    Number(cant_acompanantes) || 0;

// Normaliza el tipo de reserva.
// Solo existen dos tipos:
// - "individual"
// - "equipo"
// Si no viene ningún valor, por defecto será "individual".
const tipoReservaFinal =
    tipo_reserva === "equipo"
        ? "equipo"
        : "individual";

// Indica si la reserva es de tipo equipo.
const esReservaEquipo =
    tipoReservaFinal === "equipo";

// Por defecto la reserva no tendrá código QR.
let qr_token = null;

// Reglas para generar el QR:
//
// 1. Reserva individual:
//    Solo genera QR cuando lleva uno o más acompañantes.
//
// 2. Reserva de equipo:
//    Siempre genera QR para que los visitantes puedan registrarse.
if (
    esReservaEquipo ||
    cantidadAcompanantes > 0
    
) {
 

    // Genera un identificador único para el QR.
    qr_token = crypto.randomUUID();
}

        // Estado

        let estado = "aprobada";

        if (id_item != null) {
            estado = "pendiente";

        }

        // Guardar reserva

        await db.query(

            `INSERT INTO Reservas(

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
                id_item,
                tipoReservaFinal,
                id_equipo,
                fecha,
                hora_inicio,
                hora_fin,
                telefono,
                solicitud_especial,
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

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            ok: false,
            mensaje: "Error del servidor."

        });

    }

});

// =======================================
// Obtener todas las reservas
// GET /api/reservas
// =======================================

router.get('/', async (req, res) => {
    try {
        if (!req.session.usuario) {
            return res.status(401).json({
                ok:false,
                mensaje:"Debe iniciar sesión."
            });
        }

        const { estado, espacio, fecha } = req.query;

        let consulta = `
            SELECT
                r.*,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta,
                e.correo AS estudiante_correo,
                es.nombre AS espacio_nombre,
                i.nombre AS item_nombre
            FROM Reservas r
            INNER JOIN Estudiantes e
                ON e.id_estudiante = r.id_estudiante
            INNER JOIN Espacios es
                ON es.id_espacio = r.id_espacio
            LEFT JOIN Inventario i
                ON i.id_item = r.id_item
            WHERE 1 = 1
        `;

        const valores = [];

    if (req.session.usuario.rol === "estudiante") {

    // El estudiante solo ve sus propias reservas
    consulta += ` AND r.id_estudiante = ?`;
    valores.push(req.session.usuario.id);

    // Filtrar sus reservas por estado
    if (estado) {
        consulta += ` AND r.estado = ?`;
        valores.push(estado);
    }

    // Filtrar sus reservas por fecha
    if (fecha) {
        consulta += ` AND r.fecha = ?`;
        valores.push(fecha);
    }

    } else if (req.session.usuario.rol === "admin") {

    // El administrador sí puede ver todas las reservas
    if (estado) {
        consulta += ` AND r.estado = ?`;
        valores.push(estado);
    }

    if (espacio) {
        consulta += ` AND r.id_espacio = ?`;
        valores.push(espacio);
    }

    if (fecha) {
        consulta += ` AND r.fecha = ?`;
        valores.push(fecha);
    }

    } else {

    return res.status(403).json({
        ok: false,
        mensaje: "No tiene permisos."
    });
}

        // Ordenar por fecha
        consulta += `
            ORDER BY r.fecha_creacion DESC
        `;

        const [rows] = await db.query(consulta, valores);

        res.json({
            ok:true,
            reservas:rows
        });

    } catch (error) {
        console.error("ERROR OBTENIENDO RESERVAS:", error);

        res.status(500).json({
            ok:false,
            mensaje:"Error del servidor."
        });
    }
});



// =======================================
// Obtener horarios ocupados
// GET /api/reservas/horarios/consultar?espacio=1&fecha=2026-07-15
// =======================================

router.get('/horarios/consultar', async (req, res) => {

    try {

        if (!req.session.usuario) {

            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });

        }

        const { espacio, fecha } = req.query;

        if (!espacio || !fecha) {

            return res.status(400).json({
                ok: false,
                mensaje: "Faltan parámetros: espacio y fecha."
            });

        }

        // Espacios que comparten cancha física
        const CANCHA_COMPARTIDA = {
            2: [2, 3],
            3: [2, 3]
        };

        const espaciosAConsultar =
            CANCHA_COMPARTIDA[espacio] || [espacio];

        const [rows] = await db.query(

            `SELECT hora_inicio, hora_fin
             FROM Reservas
             WHERE id_espacio IN (?)
             AND fecha = ?
             AND estado IN ('pendiente','aprobada')`,

            [espaciosAConsultar, fecha]

        );

        // Formatea como "HH:MM–HH:MM" para que coincida
        // con el formato de los chips del frontend
        const horasOcupadas = rows.map(r => {

            const hi = r.hora_inicio.substring(0,5);
            const hf = r.hora_fin.substring(0,5);
            return `${hi}–${hf}`;

        });

        res.json({
            ok: true,
            horasOcupadas
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});



router.put('/:id/aprobar', async (req, res) => {
    try {
        if (!req.session.usuario) {
            return res.status(401).json({
                ok:false,
                mensaje:"Debe iniciar sesión."
            });
        }

        if (req.session.usuario.rol !== "admin") {
            return res.status(403).json({
                ok:false,
                mensaje:"No tiene permisos."
            });
        }

        const [rows] = await db.query(
            `SELECT estado, fecha, hora_fin
             FROM Reservas
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok:false,
                mensaje:"Reserva no encontrada."
            });
        }

        const reserva = rows[0];

        if (reserva.estado !== "pendiente") {
            return res.status(400).json({
                ok:false,
                mensaje:"La reserva ya fue procesada."
            });
        }

        const [vigencia] = await db.query(
            `SELECT TIMESTAMP(fecha, hora_fin) >= NOW() AS vigente
             FROM Reservas
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        if (!vigencia[0]?.vigente) {
            return res.status(400).json({
                ok:false,
                mensaje:"La reserva ya venció."
            });
        }

        await db.query(
            `UPDATE Reservas
             SET estado = 'aprobada'
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        res.json({
            ok:true,
            mensaje:"Reserva aprobada correctamente."
        });

    } catch (error) {
        console.error("ERROR APROBANDO RESERVA:", error);

        res.status(500).json({
            ok:false,
            mensaje:"Error del servidor."
        });
    }
});

router.put('/:id/rechazar', async (req, res) => {
    try {
        if (!req.session.usuario) {
            return res.status(401).json({
                ok:false,
                mensaje:"Debe iniciar sesión."
            });
        }

        if (req.session.usuario.rol !== "admin") {
            return res.status(403).json({
                ok:false,
                mensaje:"No tiene permisos."
            });
        }

        const [rows] = await db.query(
            `SELECT estado, fecha, hora_fin
             FROM Reservas
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok:false,
                mensaje:"Reserva no encontrada."
            });
        }

        const reserva = rows[0];

        if (reserva.estado !== "pendiente") {
            return res.status(400).json({
                ok:false,
                mensaje:"La reserva ya fue procesada."
            });
        }

        const [vigencia] = await db.query(
            `SELECT TIMESTAMP(fecha, hora_fin) >= NOW() AS vigente
             FROM Reservas
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        if (!vigencia[0]?.vigente) {
            return res.status(400).json({
                ok:false,
                mensaje:"La reserva ya venció."
            });
        }

        await db.query(
            `UPDATE Reservas
             SET estado = 'rechazada'
             WHERE id_reserva = ?`,
            [req.params.id]
        );

        res.json({
            ok:true,
            mensaje:"Reserva rechazada correctamente."
        });

    } catch (error) {
        console.error("ERROR RECHAZANDO RESERVA:", error);

        res.status(500).json({
            ok:false,
            mensaje:"Error del servidor."
        });
    }
});

// =======================================
// Cancelar Reserva
// PUT /api/reservas/:id/cancelar
// =======================================

router.put('/:id/cancelar', async (req, res) => {

    try {

        if (!req.session.usuario) {

            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });

        }

        const motivoCancelacion =
            req.body.motivo_cancelacion?.trim();

        // El estudiante debe indicar un motivo
        if (
            req.session.usuario.rol === "estudiante" &&
            !motivoCancelacion
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el motivo de la cancelación."
            });

        }

        if (
            req.session.usuario.rol === "estudiante" &&
            motivoCancelacion.length < 5
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "El motivo debe tener al menos 5 caracteres."
            });

        }

        if (
            motivoCancelacion &&
            motivoCancelacion.length > 250
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: "El motivo no puede superar los 250 caracteres."
            });

        }

        const [rows] = await db.query(

            `SELECT *
             FROM Reservas
             WHERE id_reserva = ?`,

            [req.params.id]

        );

        if (rows.length === 0) {

            return res.status(404).json({
                ok: false,
                mensaje: "Reserva no encontrada."
            });

        }

        const reserva = rows[0];

        // Un estudiante solo puede cancelar sus reservas
        if (
            req.session.usuario.rol === "estudiante" &&
            Number(reserva.id_estudiante) !==
            Number(req.session.usuario.id)
        ) {

            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos."
            });

        }

        if (
            ["cancelada", "rechazada"]
                .includes(reserva.estado)
        ) {

            return res.status(400).json({
                ok: false,
                mensaje:
                    "La reserva ya no puede cancelarse."
            });

        }

        const [vigencia] = await db.query(

            `SELECT
                TIMESTAMP(fecha, hora_inicio) > NOW()
                    AS puede_cancelar
             FROM Reservas
             WHERE id_reserva = ?`,

            [req.params.id]

        );

        if (!vigencia[0]?.puede_cancelar) {

            return res.status(400).json({
                ok: false,
                mensaje:
                    "La reserva ya comenzó o venció y no puede cancelarse."
            });

        }

        const canceladoPor =
            req.session.usuario.rol === "admin"
                ? "admin"
                : "estudiante";

        await db.query(

            `UPDATE Reservas
             SET
                estado = 'cancelada',
                cancelado_por = ?,
                motivo_cancelacion = ?
             WHERE id_reserva = ?`,

            [
                canceladoPor,
                motivoCancelacion || null,
                req.params.id
            ]

        );

        res.json({
            ok: true,
            mensaje: "Reserva cancelada correctamente."
        });

    } catch (error) {

        console.error(
            "Error cancelando reserva:",
            error
        );

        res.status(500).json({
            ok: false,
            mensaje: "Error del servidor."
        });

    }

});

module.exports = router;