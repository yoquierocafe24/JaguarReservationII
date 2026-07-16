const express = require('express');
const router = express.Router();
const db = require('../db');

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
                estado

            )

            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,

            [

                id_reserva,
                id_estudiante,
                id_espacio,
                id_item,
                tipo_reserva || "individual",
                id_equipo,
                fecha,
                hora_inicio,
                hora_fin,
                telefono,
                solicitud_especial,
                cant_acompanantes || 0,
                estado

            ]

        );

        res.json({

            ok: true,
            mensaje: "Reserva creada correctamente.",
            id_reserva

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

        // Debe haber sesión
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: "Debe iniciar sesión."
            });
        }

        let rows;

        // Si es administrador, ve todas las reservas
        if (req.session.usuario.rol === "admin") {

            [rows] = await db.query(`
                SELECT *
                FROM Reservas
                ORDER BY fecha, hora_inicio
            `);

        }

        // Si es estudiante, solo ve las suyas
        else if (req.session.usuario.rol === "estudiante") {

            [rows] = await db.query(

                `SELECT *
                 FROM Reservas
                 WHERE id_estudiante = ?
                 ORDER BY fecha, hora_inicio`,

                [req.session.usuario.id]

            );

        }

        else {

            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos."
            });

        }

        res.json({
            ok: true,
            reservas: rows
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

// =======================================
// GUARDIA - Detalle de una reserva
// GET /api/reservas/guardia/:id
// =======================================

router.get('/guardia/:id', async (req, res) => {

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

router.put('/guardia/:id/asistencia', async (req, res) => {

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
            reserva.id_estudiante !== req.session.usuario.id
        ) {

            return res.status(403).json({
                ok: false,
                mensaje: "No tiene permisos."
            });

        }

        const cancelado_por =
            req.session.usuario.rol === "admin"
                ? "admin"
                : "estudiante";

        await db.query(

            `UPDATE Reservas
             SET estado='cancelada',
                 cancelado_por=?
             WHERE id_reserva=?`,

            [
                cancelado_por,
                req.params.id
            ]

        );

        res.json({

            ok: true,
            mensaje: "Reserva cancelada."

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            ok: false,
            mensaje: "Error del servidor."

        });

    }

});

module.exports = router;