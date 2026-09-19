const express = require('express');
const router = express.Router();
const db = require('../db');

// Fecha/hora de Honduras reutilizable en las queries
// (mismo patrón ya aplicado en guardias.js, para no
// depender de la zona horaria del servidor de Railway)
const HORA_ACTUAL_HN = `CONVERT_TZ(NOW(), '+00:00', '-06:00')`;

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
            - Acompañantes: vienen de reserva_acompanantes
              (solo reservas individuales).
            - Integrantes de equipo: vienen de
              equipo_integrantes (solo reservas de equipo,
              excluyendo al líder/sublíder que ya cuenta
              como "titular").
            - Visitantes (acceso libre): vienen directo de
              asistencia, ya que NO tienen id_reserva (no
              nacen de una reserva, sino de un ingreso libre
              registrado por el guardia).
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

                        /* La reserva terminó (hora de Honduras)
                           y nunca se registró */
                        WHEN TIMESTAMP(
                            r.fecha,
                            r.hora_fin
                        ) < ${HORA_ACTUAL_HN}
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
                   ACOMPAÑANTES (reservas individuales)
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
                        ) < ${HORA_ACTUAL_HN}
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


                UNION ALL


                /* =====================================
                   INTEGRANTES DE EQUIPO
                   (reservas de tipo equipo; excluye al
                   líder/sublíder que ya se contó como
                   "titular" arriba)
                ===================================== */

                SELECT

                    r.id_reserva,

                    ei.id_estudiante,

                    e.nombre AS estudiante_nombre,

                    e.cuenta AS estudiante_cuenta,

                    'integrante' AS tipo,

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
                        ) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'

                        ELSE 'pendiente'

                    END AS estado_asistencia

                FROM reservas r

                INNER JOIN equipo_integrantes ei
                    ON ei.id_equipo =
                       r.id_equipo
                    AND ei.activo = 1
                    AND ei.id_estudiante <>
                        r.id_estudiante

                INNER JOIN estudiantes e
                    ON e.id_estudiante =
                       ei.id_estudiante

                INNER JOIN espacios es
                    ON es.id_espacio =
                       r.id_espacio

                LEFT JOIN asistencia a
                    ON a.id_reserva =
                       r.id_reserva
                    AND a.id_estudiante =
                        ei.id_estudiante

                LEFT JOIN guardia g
                    ON g.id_guardia =
                       a.id_guardia

                WHERE
                    r.fecha = ?
                    AND r.estado = 'aprobada'
                    AND r.tipo_reserva = 'equipo'


                UNION ALL


                /* =====================================
                   INTEGRANTES DE CLUB
                   (reservas de tipo club; excluye al
                   líder/sublíder que ya se contó como
                   "titular" arriba)
                ===================================== */

                SELECT

                    r.id_reserva,

                    ci.id_estudiante,

                    e.nombre AS estudiante_nombre,

                    e.cuenta AS estudiante_cuenta,

                    'miembro' AS tipo,

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
                        ) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'

                        ELSE 'pendiente'

                    END AS estado_asistencia

                FROM reservas r

                INNER JOIN club_integrantes ci
                    ON ci.id_club =
                       r.id_club
                    AND ci.activo = 1
                    AND ci.id_estudiante <>
                        r.id_estudiante

                INNER JOIN estudiantes e
                    ON e.id_estudiante =
                       ci.id_estudiante

                INNER JOIN espacios es
                    ON es.id_espacio =
                       r.id_espacio

                LEFT JOIN asistencia a
                    ON a.id_reserva =
                       r.id_reserva
                    AND a.id_estudiante =
                        ci.id_estudiante

                LEFT JOIN guardia g
                    ON g.id_guardia =
                       a.id_guardia

                WHERE
                    r.fecha = ?
                    AND r.estado = 'aprobada'
                    AND r.tipo_reserva = 'club'


                UNION ALL


                /* =====================================
                   VISITANTES (acceso libre)
                   No nacen de una reserva (id_reserva es
                   NULL en la tabla asistencia), por eso no
                   pueden salir de ningún JOIN con "reservas".
                   Se toman directo de "asistencia", y como
                   ya implican que el guardia los dejó pasar,
                   siempre cuentan como "presente".
                ===================================== */

                SELECT

                    a.id_reserva,

                    a.id_estudiante,

                    e.nombre AS estudiante_nombre,

                    e.cuenta AS estudiante_cuenta,

                    'visitante' AS tipo,

                    a.fecha_entrada AS fecha,

                    a.hora_entrada AS hora_inicio,

                    a.hora_entrada AS hora_fin,

                    a.id_espacio,

                    es.nombre AS espacio_nombre,

                    a.id_asistencia,

                    a.hora_entrada,

                    g.nombre AS guardia_nombre,

                    'presente' AS estado_asistencia

                FROM asistencia a

                INNER JOIN estudiantes e
                    ON e.id_estudiante =
                       a.id_estudiante

                INNER JOIN espacios es
                    ON es.id_espacio =
                       a.id_espacio

                LEFT JOIN guardia g
                    ON g.id_guardia =
                       a.id_guardia

                WHERE
                    a.tipo_ingreso = 'libre'
                    AND a.fecha_entrada = ?

            ) AS control

            WHERE 1 = 1
        `;

        const valores = [
            fecha,
            fecha,
            fecha,
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


        // Orden (criterio principal: si el horario YA TERMINÓ):
        //
        // 1. Primero TODO lo que sigue vigente o está por venir
        //    (el horario de esa reserva/visita aún no ha pasado).
        //    Dentro de ese grupo, la que empieza más pronto va
        //    primero.
        //
        // 2. Al final, TODO lo que ya venció (el horario ya pasó,
        //    haya o no asistido la persona). Dentro de ese grupo,
        //    se ordena de la más reciente a la más antigua (la
        //    que terminó hace menos tiempo aparece primero).
        //
        // 3. A igualdad de lo anterior, la reserva más reciente
        //    (código más alto) primero.
        //
        // 4. Dentro de una misma reserva: titular primero.
        //
        // 5. Por último, orden alfabético por nombre.
        consulta += `

            ORDER BY

                (TIMESTAMP(control.fecha, control.hora_fin) < ${HORA_ACTUAL_HN}) ASC,

                CASE
                    WHEN TIMESTAMP(control.fecha, control.hora_fin) >= ${HORA_ACTUAL_HN}
                    THEN control.hora_inicio
                END ASC,

                CASE
                    WHEN TIMESTAMP(control.fecha, control.hora_fin) < ${HORA_ACTUAL_HN}
                    THEN control.hora_fin
                END DESC,

                control.id_reserva DESC,

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

        if (!req.session.usuario) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Debe iniciar sesión.'
            });
        }

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

        /*
            Mismo universo de personas que la ruta principal
            (titulares + acompañantes confirmados de reservas
            individuales + integrantes de reservas de equipo),
            agrupado por estado_asistencia para contar
            presentes, pendientes e inasistencias en una
            sola consulta.

            NOTA: los visitantes (acceso libre) NO se incluyen
            aquí a propósito: "esperados hoy" son personas con
            reserva aprobada, y un acceso libre no corresponde
            a ninguna reserva. Si más adelante se quiere sumar
            a "presentes", avisar para agregar esa rama también.
        */

        const [filas] = await db.query(

            `SELECT
                control.estado_asistencia,
                COUNT(*) AS total
             FROM (

                SELECT
                    r.id_reserva,
                    CASE
                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'
                        WHEN TIMESTAMP(r.fecha, r.hora_fin) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'
                        ELSE 'pendiente'
                    END AS estado_asistencia
                FROM reservas r
                LEFT JOIN asistencia a
                    ON a.id_reserva = r.id_reserva
                    AND a.id_estudiante = r.id_estudiante
                WHERE r.fecha = ?
                AND r.estado = 'aprobada'

                UNION ALL

                SELECT
                    r.id_reserva,
                    CASE
                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'
                        WHEN TIMESTAMP(r.fecha, r.hora_fin) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'
                        ELSE 'pendiente'
                    END AS estado_asistencia
                FROM reserva_acompanantes ra
                INNER JOIN reservas r
                    ON r.id_reserva = ra.id_reserva
                LEFT JOIN asistencia a
                    ON a.id_reserva = r.id_reserva
                    AND a.id_estudiante = ra.id_estudiante
                WHERE r.fecha = ?
                AND r.estado = 'aprobada'
                AND ra.confirmado = 1
                AND ra.rol = 'acompanante'

                UNION ALL

                SELECT
                    r.id_reserva,
                    CASE
                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'
                        WHEN TIMESTAMP(r.fecha, r.hora_fin) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'
                        ELSE 'pendiente'
                    END AS estado_asistencia
                FROM reservas r
                INNER JOIN equipo_integrantes ei
                    ON ei.id_equipo = r.id_equipo
                    AND ei.activo = 1
                    AND ei.id_estudiante <> r.id_estudiante
                LEFT JOIN asistencia a
                    ON a.id_reserva = r.id_reserva
                    AND a.id_estudiante = ei.id_estudiante
                WHERE r.fecha = ?
                AND r.estado = 'aprobada'
                AND r.tipo_reserva = 'equipo'

                UNION ALL

                SELECT
                    r.id_reserva,
                    CASE
                        WHEN a.id_asistencia IS NOT NULL
                        THEN 'presente'
                        WHEN TIMESTAMP(r.fecha, r.hora_fin) < ${HORA_ACTUAL_HN}
                        THEN 'inasistencia'
                        ELSE 'pendiente'
                    END AS estado_asistencia
                FROM reservas r
                INNER JOIN club_integrantes ci
                    ON ci.id_club = r.id_club
                    AND ci.activo = 1
                    AND ci.id_estudiante <> r.id_estudiante
                LEFT JOIN asistencia a
                    ON a.id_reserva = r.id_reserva
                    AND a.id_estudiante = ci.id_estudiante
                WHERE r.fecha = ?
                AND r.estado = 'aprobada'
                AND r.tipo_reserva = 'club'

             ) AS control
             GROUP BY control.estado_asistencia`,

            [fecha, fecha, fecha, fecha]

        );

        // Convierte [{estado_asistencia:'presente', total:5}, ...]
        // en un objeto plano, aunque alguna categoría venga en 0
        const conteo = { presente: 0, pendiente: 0, inasistencia: 0 };

        filas.forEach(fila => {
            conteo[fila.estado_asistencia] = Number(fila.total);
        });

        const esperados =
            conteo.presente + conteo.pendiente + conteo.inasistencia;

        return res.json({
            ok: true,
            fecha,
            resumen: {
                esperados,
                presentes: conteo.presente,
                pendientes: conteo.pendiente,
                inasistencias: conteo.inasistencia
            }
        });

    } catch (error) {

        console.error(
            'ERROR OBTENIENDO RESUMEN DE ASISTENCIA:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo obtener el resumen de asistencia.'
        });
    }

});

module.exports = router;