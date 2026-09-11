const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require("crypto");

// =======================================
// Middlewares de ayuda (sesión / roles)
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

function requiereEstudiante(req, res, next) {
    if (req.session.usuario.rol !== "estudiante") {
        return res.status(403).json({
            ok: false,
            mensaje: "No tiene permisos para realizar reservas."
        });
    }
    next();
}

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
         FROM reservas
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

// Quita tildes y pasa a minúsculas, para comparar
// "Fútbol" con "futbol" como si fueran lo mismo.
function normalizarTexto(texto) {
    return (texto || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
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
// Crear Reserva
// POST /api/reservas
// =======================================

router.post('/', requiereSesion, requiereEstudiante, async (req, res) => {

    try {

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


        // Validación de longitud de solicitud especial

        if (solicitud_especial && solicitud_especial.length > 250) {
       return res.status(400).json({
        ok: false,
        mensaje: "La solicitud especial no puede superar los 250 caracteres."
    });
}

// =======================================
        // Regla: la reserva debe hacerse con al
        // menos 24 horas de anticipación.
        //
        // Se construye la fecha/hora de la reserva
        // indicando explícitamente el offset de
        // Honduras (-06:00), para no depender de la
        // zona horaria del servidor (mismo tipo de
        // problema que causó el bug de las 23:00).
        // =======================================

        const fechaHoraReserva = new Date(
            `${fecha}T${hora_inicio}:00-06:00`
        );

        const ahora = new Date();

        const horasDeAnticipacion =
            (fechaHoraReserva - ahora) / (1000 * 60 * 60);

        if (horasDeAnticipacion < 24) {

            return res.status(400).json({
                ok: false,
                mensaje: "Las reservas deben hacerse con al menos 24 horas de anticipación."
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

            `SELECT * FROM estudiantes
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
        // Normaliza el tipo de reserva
        // =======================================
 
        const tipoReservaFinal =
            tipo_reserva === "equipo" ? "equipo" : "individual";
 
        let idEquipoFinal = null;
    
      // =======================================
        // Regla (Fase 2): reserva de EQUIPO —
        // quien envía debe ser líder o sublíder
        // activo del equipo, y el deporte del
        // equipo debe coincidir con el espacio.
        // =======================================
 
        if (tipoReservaFinal === "equipo") {
 
            if (!id_equipo) {
                return res.status(400).json({
                    ok: false,
                    mensaje: "Debe indicar el equipo."
                });
            }
 
            const [equipo] = await db.query(
                `SELECT id_equipo, deporte, activo
                 FROM equipos
                 WHERE id_equipo = ?`,
                [id_equipo]
            );
 
            if (equipo.length === 0 || !equipo[0].activo) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El equipo no existe o está inactivo."
                });
            }
 
            const [membresia] = await db.query(
                `SELECT rol
                 FROM equipo_integrantes
                 WHERE id_equipo = ?
                 AND id_estudiante = ?
                 AND activo = 1
                 AND rol IN ('lider','sublider')`,
                [id_equipo, id_estudiante]
            );
 
            if (membresia.length === 0) {
                return res.status(403).json({
                    ok: false,
                    mensaje: "Solo el líder o sublíder del equipo pueden reservar en su nombre."
                });
            }
 
            const [espacioEquipo] = await db.query(
                `SELECT nombre FROM espacios WHERE id_espacio = ?`,
                [id_espacio]
            );
 
            if (espacioEquipo.length === 0) {
                return res.status(404).json({
                    ok: false,
                    mensaje: "El espacio indicado no existe."
                });
            }
 
           const deporteEquipo = normalizarTexto(equipo[0].deporte);
            const nombreEspacio = normalizarTexto(espacioEquipo[0].nombre);         
 
            if (deporteEquipo !== nombreEspacio) {
                return res.status(400).json({
                    ok: false,
                    mensaje: `Este equipo es de ${equipo[0].deporte}, no puede reservar en ${espacioEquipo[0].nombre}.`
                });
            }
 
            idEquipoFinal = id_equipo;
        }

        // =======================================
        // Choque de horario
        //
        // - Reserva individual: se revisa solo al
        //   estudiante que hace la reserva.
        // - Reserva de equipo: se revisa a CADA
        //   integrante activo del equipo (líder,
        //   sublíder y jugadores), no solo a quien
        //   la está creando — así se evita que
        //   alguien quede "reservado" en dos
        //   lugares a la misma hora.
        // =======================================

        if (tipoReservaFinal === "individual") {

            const hayConflicto = await estudianteTieneConflictoHorario(
                id_estudiante,
                fecha,
                hora_inicio,
                hora_fin
            );

            if (hayConflicto) {

                return res.status(400).json({
                    ok: false,
                    mensaje: "Ya tienes una reserva en ese horario. No puedes tener dos reservas al mismo tiempo."
                });

            }

        } else if (tipoReservaFinal === "equipo" && idEquipoFinal) {

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
                 FROM reservas
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

            // Cuántas reservas ya existen para ese mismo
            // juego, en esa misma fecha y horario
            const [reservasDelJuego] = await db.query(

                `SELECT *
                 FROM reservas
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


// Por defecto la reserva no tendrá código QR.
let qr_token = null;

        if (tipoReservaFinal === "individual" && cantidadAcompanantes > 0) {
            qr_token = crypto.randomUUID();
        }
        // Estado

        let estado = "aprobada";

        if (id_item != null) {
            estado = "pendiente";

        }

        // Guardar reserva

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
                id_item,
                tipoReservaFinal,
                idEquipoFinal,
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

router.get('/', requiereSesion, async (req, res) => {
    try {

        const { estado, espacio, fecha } = req.query;

        let consulta = `
            SELECT
                r.*,
                e.nombre AS estudiante_nombre,
                e.cuenta AS estudiante_cuenta,
                e.correo AS estudiante_correo,
                es.nombre AS espacio_nombre,
                i.nombre AS item_nombre,
                (
                    SELECT COUNT(*)
                    FROM equipo_integrantes ei
                    WHERE ei.id_equipo = r.id_equipo
                      AND ei.activo = 1
                ) AS cantidad_equipo
            FROM reservas r
            INNER JOIN estudiantes e
                ON e.id_estudiante = r.id_estudiante
            INNER JOIN espacios es
                ON es.id_espacio = r.id_espacio
            LEFT JOIN inventario i
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
// ADMIN - Detalle de acompañantes
// GET /api/reservas/:id/acompanantes
// =======================================

router.get('/:id/acompanantes', requiereSesion, requiereAdmin, async (req, res) => {

    try {

        const idReserva = req.params.id;

        // Consultar la cantidad permitida
        const [reservas] = await db.query(
            `SELECT
                id_reserva,
                cant_acompanantes
             FROM reservas
             WHERE id_reserva = ?`,
            [idReserva]
        );

        if (reservas.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: "Reserva no encontrada."
            });
        }

        // Consultar quienes llenaron el QR
        const [acompanantes] = await db.query(
            `SELECT
                e.id_estudiante,
                e.nombre,
                e.cuenta,
                ra.fecha_registro
             FROM reserva_acompanantes ra
             INNER JOIN estudiantes e
                ON e.id_estudiante = ra.id_estudiante
             WHERE ra.id_reserva = ?
             AND ra.confirmado = 1
             ORDER BY ra.fecha_registro ASC`,
            [idReserva]
        );

        return res.json({
            ok: true,

            cantidad_permitida:
                Number(reservas[0].cant_acompanantes || 0),

            total_registrados:
                acompanantes.length,

            acompanantes
        });

    } catch (error) {

        console.error(
            "ERROR CONSULTANDO ACOMPAÑANTES:",
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                "No se pudieron consultar los acompañantes."
        });
    }
});

// =======================================
//  Cantidad de integrantes del equipo
//  (vista ESTUDIANTE - solo el dueño de la reserva)
// GET /api/reservas/:id/equipo-cantidad
// =======================================

router.get('/:id/equipo-cantidad', requiereSesion, requiereEstudiante, async (req, res) => {

    try {

        const id_estudiante = req.session.usuario.id;

        const [reservas] = await db.query(
            `SELECT id_equipo, tipo_reserva, id_estudiante
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

        const reserva = reservas[0];

        // Solo el estudiante dueño de la reserva puede consultarla
        if (reserva.id_estudiante !== id_estudiante) {
            return res.status(403).json({
                ok: false,
                mensaje: "No tienes permiso para consultar esta reserva."
            });
        }

        if (reserva.tipo_reserva !== 'equipo') {
            return res.status(400).json({
                ok: false,
                mensaje: "Esta reserva no es de tipo equipo."
            });
        }

        const [[{ cantidad }]] = await db.query(
            `SELECT COUNT(*) AS cantidad
             FROM equipo_integrantes
             WHERE id_equipo = ?
               AND activo = 1`,
            [reserva.id_equipo]
        );

        res.json({
            ok: true,
            id_equipo: reserva.id_equipo,
            cantidad
        });

    } catch (error) {
        console.error("ERROR OBTENIENDO CANTIDAD DE INTEGRANTES:", error);
        res.status(500).json({ ok: false, mensaje: "Error del servidor." });
    }

});


// =======================================
// Obtener horarios ocupados de un ESPACIO
// GET /api/reservas/horarios/consultar?espacio=1&fecha=2026-07-15
// =======================================

router.get('/horarios/consultar', requiereSesion, async (req, res) => {

    try {

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
             FROM reservas
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

// =======================================
// Obtener horarios ocupados del ESTUDIANTE
// (sin importar el espacio) — se usa para
// avisar ANTES de enviar el formulario que
// ya tiene otra reserva a esa hora.
//
// Incluye también las horas donde el
// estudiante está comprometido por ser
// integrante activo de un equipo con
// reserva ese día (no solo sus reservas
// personales), para que el aviso visual
// coincida con la validación real del
// backend.
// GET /api/reservas/mis-horarios?fecha=2026-08-20
// =======================================

router.get('/mis-horarios', requiereSesion, requiereEstudiante, async (req, res) => {

    try {

        const { fecha } = req.query;

        if (!fecha) {

            return res.status(400).json({
                ok: false,
                mensaje: "Falta el parámetro: fecha."
            });

        }

        const [rows] = await db.query(

            `SELECT r.hora_inicio, r.hora_fin
             FROM reservas r
             WHERE r.fecha = ?
             AND r.estado IN ('pendiente','aprobada')
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
             )`,

            [fecha, req.session.usuario.id, req.session.usuario.id]

        );

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



router.put('/:id/aprobar', requiereSesion, requiereAdmin, async (req, res) => {
    try {

        const [rows] = await db.query(
            `SELECT estado, fecha, hora_fin
             FROM reservas
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

        // =======================================
        // Vigencia — comparada con la hora de
        // Honduras (CONVERT_TZ), no con NOW() directo.
        // NOW() del servidor está en UTC, mientras
        // hora_fin se guarda en hora local (-06:00);
        // sin este ajuste, reservas de tarde/noche se
        // marcan "vencidas" varias horas antes de tiempo.
        // =======================================

        const [vigencia] = await db.query(
            `SELECT TIMESTAMP(fecha, hora_fin) >= CONVERT_TZ(NOW(), '+00:00', '-06:00') AS vigente
             FROM reservas
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
            `UPDATE reservas
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

router.put('/:id/rechazar', requiereSesion, requiereAdmin, async (req, res) => {
    try {

        const motivoRechazo = (req.body.motivo_rechazo || '').trim();

        if (!motivoRechazo) {
            return res.status(400).json({
                ok: false,
                mensaje: "Debe indicar el motivo del rechazo."
            });
        }

        if (motivoRechazo.length < 5) {
            return res.status(400).json({
                ok: false,
                mensaje: "El motivo debe tener al menos 5 caracteres."
            });
        }

        if (motivoRechazo.length > 250) {
            return res.status(400).json({
                ok: false,
                mensaje: "El motivo no puede superar los 250 caracteres."
            });
        }

        const [rows] = await db.query(
            `SELECT estado, fecha, hora_fin
             FROM reservas
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

        // =======================================
        // Vigencia — comparada con la hora de
        // Honduras (CONVERT_TZ). Ver nota en /aprobar.
        // =======================================

        const [vigencia] = await db.query(
            `SELECT TIMESTAMP(fecha, hora_fin) >= CONVERT_TZ(NOW(), '+00:00', '-06:00') AS vigente
             FROM reservas
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
            `UPDATE reservas
             SET estado = 'rechazada',
                 motivo_rechazo = ?
             WHERE id_reserva = ?`,
            [motivoRechazo, req.params.id]
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

router.put('/:id/cancelar', requiereSesion, async (req, res) => {

    try {

     const motivoCancelacion = (req.body.motivo_cancelacion || '').trim();

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
             ["estudiante", "admin"].includes(req.session.usuario.rol) &&
            motivoCancelacion.length < 5
        )       {
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
             FROM reservas
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
                   "Esta reserva ya fue cancelada."
            });

        }

        // =======================================
        // Vigencia — comparada con la hora de
        // Honduras (CONVERT_TZ). Ver nota en /aprobar.
        // =======================================

        const [vigencia] = await db.query(

            `SELECT
                TIMESTAMP(fecha, hora_inicio) > CONVERT_TZ(NOW(), '+00:00', '-06:00')
                    AS puede_cancelar
             FROM reservas
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

            `UPDATE reservas
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