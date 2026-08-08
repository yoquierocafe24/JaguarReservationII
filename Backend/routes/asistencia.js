const express = require('express');
const router = express.Router();
const db = require('../db');


// ========================================
// OBTENER CONTROL DE ASISTENCIA
// GET /asistencia
// ========================================

router.get('/', async (req, res) => {

    try {

        // Verificar sesión
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Debe iniciar sesión.'
            });
        }

        // Solo administrador
        if (req.session.usuario.rol !== 'admin') {
            return res.status(403).json({
                ok: false,
                mensaje: 'No tiene permisos.'
            });
        }

        const {
            fecha,
            espacio,
            tipo,
            estado
        } = req.query;

        if (!fecha) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe especificar una fecha.'
            });
        }

        /*
            Primero se construye la lista de personas
            esperadas en cada reserva:

            - Titular: viene directamente de reservas.
            - Acompañantes: vienen de reserva_acompanantes.
        */

        let consulta = `

            SELECT *
            FROM (

                /* =====================================
                   TITULARES
                ===================================== */

                SELECT

                    r.id_reserva,

                    r.id_estudiante,

                    e.nombre AS estudiante_nombre,

                    e.cuenta AS estudiante_cuenta,

                    'titular' AS tipo,

                    r.fecha,

                    r.hora_inicio,

                    r.hora_fin,

                    r.id_espacio,

                    es.nombre AS espacio_nombre,

                    a.id_asistencia,

                    a.hora_entrada,

                    g.nombre AS guardia_nombre,

                    CASE

                        /* El guardia registró la entrada */
                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'

                        /* La reserva terminó y nunca se registró */
                        WHEN TIMESTAMP(
                            r.fecha,
                            r.hora_fin
                        ) < NOW()
                        THEN 'inasistencia'

                        /* La reserva todavía no termina */
                        ELSE 'pendiente'

                    END AS estado_asistencia

                FROM reservas r

                INNER JOIN estudiantes e
                    ON e.id_estudiante =
                       r.id_estudiante

                INNER JOIN espacios es
                    ON es.id_espacio =
                       r.id_espacio

                LEFT JOIN asistencia a
                    ON a.id_reserva =
                       r.id_reserva
                    AND a.id_estudiante =
                        r.id_estudiante

                LEFT JOIN guardia g
                    ON g.id_guardia =
                       a.id_guardia

                WHERE
                    r.fecha = ?
                    AND r.estado = 'aprobada'


                UNION ALL


                /* =====================================
                   ACOMPAÑANTES
                ===================================== */

                SELECT

                    r.id_reserva,

                    ra.id_estudiante,

                    e.nombre AS estudiante_nombre,

                    e.cuenta AS estudiante_cuenta,

                    'acompanante' AS tipo,

                    r.fecha,

                    r.hora_inicio,

                    r.hora_fin,

                    r.id_espacio,

                    es.nombre AS espacio_nombre,

                    a.id_asistencia,

                    a.hora_entrada,

                    g.nombre AS guardia_nombre,

                    CASE

                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'

                        WHEN TIMESTAMP(
                            r.fecha,
                            r.hora_fin
                        ) < NOW()
                        THEN 'inasistencia'

                        ELSE 'pendiente'

                    END AS estado_asistencia

                FROM reserva_acompanantes ra

                INNER JOIN reservas r
                    ON r.id_reserva =
                       ra.id_reserva

                INNER JOIN estudiantes e
                    ON e.id_estudiante =
                       ra.id_estudiante

                INNER JOIN espacios es
                    ON es.id_espacio =
                       r.id_espacio

                LEFT JOIN asistencia a
                    ON a.id_reserva =
                       r.id_reserva
                    AND a.id_estudiante =
                        ra.id_estudiante

                LEFT JOIN guardia g
                    ON g.id_guardia =
                       a.id_guardia

                WHERE
                    r.fecha = ?
                    AND r.estado = 'aprobada'
                    AND ra.confirmado = 1
                    AND ra.rol = 'acompanante'

            ) AS control

            WHERE 1 = 1
        `;

        const valores = [
            fecha,
            fecha
        ];


        // Filtrar por espacio
        if (espacio) {

            consulta += `
                AND control.id_espacio = ?
            `;

            valores.push(espacio);
        }


        // Filtrar por tipo
        if (tipo) {

            consulta += `
                AND control.tipo = ?
            `;

            valores.push(tipo);
        }


        // Filtrar por estado
        if (estado) {

            consulta += `
                AND control.estado_asistencia = ?
            `;

            valores.push(estado);
        }


        // Mostrar primero las reservas más tempranas
        // y dentro de ellas titular antes que acompañantes
        consulta += `

            ORDER BY
                control.hora_inicio ASC,

                CASE
                    WHEN control.tipo = 'titular'
                    THEN 1
                    ELSE 2
                END,

                control.estudiante_nombre ASC
        `;


        const [filas] =
            await db.query(
                consulta,
                valores
            );


        return res.json({
            ok: true,
            asistencias: filas
        });

    } catch (error) {

        console.error(
            'ERROR OBTENIENDO CONTROL DE ASISTENCIA:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                'No se pudo obtener el control de asistencia.'
        });
    }

});

// ========================================
// RESUMEN DE ASISTENCIA POR FECHA
// GET /asistencia/resumen?fecha=2026-08-07
// ========================================

router.get('/resumen', async (req, res) => {

    try {

        // Verificar sesión
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Debe iniciar sesión.'
            });
        }

        // Solo administrador
        if (req.session.usuario.rol !== 'admin') {
            return res.status(403).json({
                ok: false,
                mensaje: 'No tiene permisos.'
            });
        }

        const { fecha } = req.query;

        if (!fecha) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe especificar una fecha.'
            });
        }


        // Total de asistencias registradas
        const [[total]] =
            await db.query(

                `SELECT
                    COUNT(*) AS total
                 FROM asistencia
                 WHERE fecha_entrada = ?
                 AND id_reserva IS NOT NULL`,

                [fecha]
            );


        // Titulares presentes
        const [[titulares]] =
            await db.query(

                `SELECT
                    COUNT(*) AS total
                 FROM asistencia
                 WHERE fecha_entrada = ?
                 AND id_reserva IS NOT NULL
                 AND tipo_asistencia = 'titular'`,

                [fecha]
            );


        // Acompañantes presentes
        const [[acompanantes]] =
            await db.query(

                `SELECT
                    COUNT(*) AS total
                 FROM asistencia
                 WHERE fecha_entrada = ?
                 AND id_reserva IS NOT NULL
                 AND tipo_asistencia = 'acompanante'`,

                [fecha]
            );


        return res.json({

            ok: true,

            fecha,

            resumen: {

                asistencias:
                    Number(
                        total.total || 0
                    ),

                titulares_presentes:
                    Number(
                        titulares.total || 0
                    ),

                acompanantes_presentes:
                    Number(
                        acompanantes.total || 0
                    )
            }
        });

    } catch (error) {

        console.error(
            'ERROR OBTENIENDO RESUMEN DE ASISTENCIA:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                'No se pudo obtener el resumen de asistencia.'
        });
    }

});

/*

// Nota:
// Por ahora esta ruta permanece comentada
// porque el QR de ingreso libre aún no ha
// sido desarrollado.

// ========================================
// REGISTRAR INGRESO LIBRE AL POLIDEPORTIVO
// POST /asistencia/libre
// ========================================

router.post('/libre', async (req, res) => {

    try {

        // El estudiante debe tener sesión iniciada
        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Debe iniciar sesión.'
            });
        }

        if (req.session.usuario.rol !== 'estudiante') {
            return res.status(403).json({
                ok: false,
                mensaje: 'Solo los estudiantes pueden registrar ingreso libre.'
            });
        }

        const id_estudiante =
            req.session.usuario.id;

        // Verificar que el estudiante siga activo
        const [estudiantes] = await db.query(
            `SELECT id_estudiante
             FROM estudiantes
             WHERE id_estudiante = ?
             AND activo = 1`,
            [id_estudiante]
        );

        if (estudiantes.length === 0) {
            return res.status(403).json({
                ok: false,
                mensaje: 'El estudiante está inactivo.'
            });
        }

        // Fecha y hora de Honduras
        const [fechaHora] = await db.query(
            `SELECT
                DATE(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                ) AS fecha_hn,

                TIME(
                    CONVERT_TZ(
                        NOW(),
                        '+00:00',
                        '-06:00'
                    )
                ) AS hora_hn`
        );

        const fechaEntrada =
            fechaHora[0].fecha_hn;

        const horaEntrada =
            fechaHora[0].hora_hn;

        // Evitar registrar dos veces el mismo ingreso libre
        // del estudiante durante el mismo día.
        const [yaRegistrado] = await db.query(
            `SELECT id_asistencia
             FROM asistencia
             WHERE id_estudiante = ?
             AND fecha_entrada = ?
             AND tipo_ingreso = 'libre'
             LIMIT 1`,
            [
                id_estudiante,
                fechaEntrada
            ]
        );

        if (yaRegistrado.length > 0) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Ya registraste tu ingreso al polideportivo hoy.'
            });
        }

        // Guardar asistencia sin reserva ni guardia
        await db.query(
            `INSERT INTO asistencia
            (
                id_reserva,
                id_estudiante,
                tipo_asistencia,
                hora_entrada,
                id_guardia,
                tipo_ingreso,
                origen,
                fecha_entrada
            )
            VALUES
            (
                NULL,
                ?,
                'visitante',
                ?,
                NULL,
                'libre',
                'qr',
                ?
            )`,
            [
                id_estudiante,
                horaEntrada,
                fechaEntrada
            ]
        );

        return res.json({
            ok: true,
            mensaje:
                'Ingreso registrado correctamente.',
            fecha_entrada:
                fechaEntrada,
            hora_entrada:
                horaEntrada
        });

    } catch (error) {

        console.error(
            'ERROR REGISTRANDO INGRESO LIBRE:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                'No se pudo registrar el ingreso.'
        });
    }
});

*/

module.exports = router;