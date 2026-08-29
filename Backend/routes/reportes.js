// routes/reportes.js — Modulo de Reportes (Jaguar Reserva)
// Consultas de solo lectura que AGRUPAN y CUENTAN datos ya existentes
// (Estudiantes, Reservas, Espacios y Equipos/Clubes). No crea tablas nuevas.
//
// Endpoints:
//   GET /api/reportes/reservas-por-carrera      -> reservas agrupadas por carrera
//   GET /api/reportes/reservas-por-espacio      -> reservas agrupadas por espacio
//   GET /api/reportes/primer-ingreso            -> comparativo primer ingreso vs reingreso
//   GET /api/reportes/integrantes-por-equipo    -> cantidad de integrantes por equipo/club
//   GET /api/reportes/resumen                   -> los cuatro reportes juntos (para exportar)
//
// Filtros disponibles (query string, todos opcionales):
//   carrera          = texto exacto de la carrera
//   id_espacio       = id del espacio (futbol, voleibol, baloncesto, Zona Jaguar)
//   id_equipo        = id del equipo/club
//   primer_ingreso   = si | no   (atajo para filtrar por tipo de ingreso)
//   tipo_ingreso     = texto exacto del tipo de ingreso
//   estado           = pendiente | aprobada | rechazada | cancelada
//
// Periodos (query string, opcionales):
//   fecha_inicio & fecha_fin = rango explicito (YYYY-MM-DD)
//   id_periodo               = usa el rango del periodo academico (trimestral)
//   periodo=anual & anio=YYYY          = todo el año
//   periodo=trimestral & anio=YYYY & trimestre=1..4  = un trimestre calculado
//
// NOTA IMPORTANTE sobre carrera/tipo_ingreso:
// Un mismo estudiante puede tener VARIAS filas en estudiante_periodo
// (una por cada trimestre subido por Excel). Para no duplicar el conteo
// de reservas al unir con esa tabla, todas las consultas usan la
// subconsulta SUBQUERY_ULTIMO_PERIODO, que trae solo el registro MÁS
// RECIENTE de cada estudiante (su carrera/tipo_ingreso "actuales").

const express = require('express');
const router = express.Router();
const db = require('../db');

// -------------------------------------------------------------
// Subconsulta reusable: el registro más reciente de
// estudiante_periodo por cada estudiante (evita duplicar
// reservas al unir con una tabla que tiene varias filas
// por estudiante).
// -------------------------------------------------------------
const SUBQUERY_ULTIMO_PERIODO = `
    (
        SELECT ep1.id_estudiante, ep1.carrera, ep1.tipo_ingreso
        FROM estudiante_periodo ep1
        INNER JOIN (
            SELECT id_estudiante, MAX(id) AS max_id
            FROM estudiante_periodo
            GROUP BY id_estudiante
        ) ultimo ON ultimo.max_id = ep1.id
    )
`;

// -------------------------------------------------------------
// Construye la parte WHERE (fechas + filtros) sobre las reservas.
// Usa los alias: r = reservas, e = estudiantes, ep = subconsulta
// del período más reciente (ver SUBQUERY_ULTIMO_PERIODO).
// Devuelve { clausula: 'AND ...', params: [...] }.
// -------------------------------------------------------------
function construirFiltros(q) {
    const condiciones = [];
    const params = [];

    // ---- Rango de fechas / periodo ----
    if (q.fecha_inicio && q.fecha_fin) {
        condiciones.push('r.fecha BETWEEN ? AND ?');
        params.push(q.fecha_inicio, q.fecha_fin);

    } else if (q.id_periodo) {
        // Trimestral por periodo academico registrado
        condiciones.push(
            'r.fecha BETWEEN (SELECT fecha_inicio FROM periodo_academico WHERE id_periodo = ?) ' +
            'AND (SELECT fecha_fin FROM periodo_academico WHERE id_periodo = ?)'
        );
        params.push(q.id_periodo, q.id_periodo);

    } else if (q.periodo === 'anual' && q.anio) {
        condiciones.push('YEAR(r.fecha) = ?');
        params.push(q.anio);

    } else if (q.periodo === 'trimestral' && q.anio && q.trimestre) {
        const t = Number(q.trimestre);
        const mesInicio = (t - 1) * 3 + 1;        // 1,4,7,10
        const mesFin = mesInicio + 2;             // 3,6,9,12
        const inicio = `${q.anio}-${String(mesInicio).padStart(2, '0')}-01`;
        // ultimo dia del mes final
        const fin = new Date(Number(q.anio), mesFin, 0).toISOString().slice(0, 10);
        condiciones.push('r.fecha BETWEEN ? AND ?');
        params.push(inicio, fin);
    }

    // ---- Filtros adicionales ----
    if (q.carrera) {
        condiciones.push('ep.carrera = ?');
        params.push(q.carrera);
    }

    if (q.id_espacio) {
        condiciones.push('r.id_espacio = ?');
        params.push(q.id_espacio);
    }

    if (q.id_equipo) {
        condiciones.push('r.id_equipo = ?');
        params.push(q.id_equipo);
    }

    if (q.estado) {
        condiciones.push('r.estado = ?');
        params.push(q.estado);
    }

    // Primer ingreso: atajo si/no
    if (q.primer_ingreso === 'si') {
        condiciones.push("LOWER(COALESCE(ep.tipo_ingreso, '')) LIKE '%primer%'");
    } else if (q.primer_ingreso === 'no') {
        condiciones.push("(ep.tipo_ingreso IS NOT NULL AND ep.tipo_ingreso <> '' AND LOWER(ep.tipo_ingreso) NOT LIKE '%primer%')");
    } else if (q.tipo_ingreso) {
        condiciones.push('ep.tipo_ingreso = ?');
        params.push(q.tipo_ingreso);
    }

    const clausula = condiciones.length ? 'AND ' + condiciones.join(' AND ') : '';
    return { clausula, params };
}

// =============================================================
// 0) OPCIONES para los filtros (carreras, espacios, periodos, años)
// =============================================================
router.get('/opciones', async (req, res) => {
    try {
        const [espacios] = await db.query(
            `SELECT id_espacio, nombre FROM espacios ORDER BY id_espacio`
        );

        const [carreras] = await db.query(
            `SELECT DISTINCT carrera
             FROM estudiante_periodo
             WHERE carrera IS NOT NULL AND carrera <> ''
             ORDER BY carrera`
        );

        const [periodos] = await db.query(
            `SELECT id_periodo, nombre, YEAR(fecha_inicio) AS anio
             FROM periodo_academico
             ORDER BY fecha_inicio DESC`
        );

        const [anios] = await db.query(
            `SELECT DISTINCT YEAR(fecha) AS anio
             FROM reservas
             WHERE fecha IS NOT NULL
             ORDER BY anio DESC`
        );

        res.json({
            ok: true,
            espacios,
            carreras: carreras.map(c => c.carrera),
            periodos,
            anios: anios.map(a => a.anio)
        });
    } catch (error) {
        console.error('Error opciones:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 1) Reservas agrupadas por CARRERA
// =============================================================
router.get('/reservas-por-carrera', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [rows] = await db.query(
            `SELECT COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera') AS carrera,
                    COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY carrera
             ORDER BY total_reservas DESC`,
            params
        );

        res.json({ ok: true, reporte: 'reservas_por_carrera', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error reservas-por-carrera:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 2) Reservas agrupadas por ESPACIO
// =============================================================
router.get('/reservas-por-espacio', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [rows] = await db.query(
            `SELECT r.id_espacio,
                    COALESCE(s.nombre, 'Sin espacio') AS espacio,
                    COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN espacios s ON s.id_espacio = r.id_espacio
             WHERE 1 = 1 ${clausula}
             GROUP BY r.id_espacio, s.nombre
             ORDER BY total_reservas DESC`,
            params
        );

        res.json({ ok: true, reporte: 'reservas_por_espacio', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error reservas-por-espacio:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 3) Comparativo PRIMER INGRESO vs REINGRESO
// =============================================================
router.get('/primer-ingreso', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [rows] = await db.query(
            `SELECT CASE
                        WHEN LOWER(COALESCE(ep.tipo_ingreso, '')) LIKE '%primer%' THEN 'Primer ingreso'
                        WHEN ep.tipo_ingreso IS NULL OR ep.tipo_ingreso = '' THEN 'Sin definir'
                        ELSE 'Reingreso'
                    END AS categoria,
                    COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY categoria
             ORDER BY total_reservas DESC`,
            params
        );

        res.json({ ok: true, reporte: 'comparativo_primer_ingreso', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error primer-ingreso:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 4) Cantidad de INTEGRANTES por EQUIPO / CLUB
// =============================================================
router.get('/integrantes-por-equipo', async (req, res) => {
    try {
        const params = [];
        let filtroEquipo = '';
        if (req.query.id_equipo) {
            filtroEquipo = 'AND eq.id_equipo = ?';
            params.push(req.query.id_equipo);
        }

        const [rows] = await db.query(
            `SELECT eq.id_equipo,
                    eq.nombre AS equipo,
                    eq.deporte,
                    COUNT(ei.id_estudiante) AS cantidad_integrantes
             FROM equipos eq
             LEFT JOIN equipo_integrantes ei
                    ON ei.id_equipo = eq.id_equipo AND ei.activo = 1
             WHERE eq.activo = 1 ${filtroEquipo}
             GROUP BY eq.id_equipo, eq.nombre, eq.deporte
             ORDER BY cantidad_integrantes DESC`,
            params
        );

        res.json({ ok: true, reporte: 'integrantes_por_equipo', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error integrantes-por-equipo:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 5) RESUMEN: los cuatro reportes juntos (util para exportar)
// =============================================================
router.get('/resumen', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [porCarrera] = await db.query(
            `SELECT COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera') AS carrera, COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula} GROUP BY carrera ORDER BY total_reservas DESC`,
            params
        );

        const [porEspacio] = await db.query(
            `SELECT r.id_espacio, COALESCE(s.nombre, 'Sin espacio') AS espacio, COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN espacios s ON s.id_espacio = r.id_espacio
             WHERE 1 = 1 ${clausula} GROUP BY r.id_espacio, s.nombre ORDER BY total_reservas DESC`,
            params
        );

        const [comparativo] = await db.query(
            `SELECT CASE
                        WHEN LOWER(COALESCE(ep.tipo_ingreso, '')) LIKE '%primer%' THEN 'Primer ingreso'
                        WHEN ep.tipo_ingreso IS NULL OR ep.tipo_ingreso = '' THEN 'Sin definir'
                        ELSE 'Reingreso'
                    END AS categoria, COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula} GROUP BY categoria ORDER BY total_reservas DESC`,
            params
        );

        const [equipos] = await db.query(
            `SELECT eq.id_equipo, eq.nombre AS equipo, eq.deporte,
                    COUNT(ei.id_estudiante) AS cantidad_integrantes
             FROM equipos eq
             LEFT JOIN equipo_integrantes ei ON ei.id_equipo = eq.id_equipo AND ei.activo = 1
             WHERE eq.activo = 1
             GROUP BY eq.id_equipo, eq.nombre, eq.deporte
             ORDER BY cantidad_integrantes DESC`
        );

        res.json({
            ok: true,
            reporte: 'resumen_general',
            filtros: req.query,
            datos: {
                reservas_por_carrera: porCarrera,
                reservas_por_espacio: porEspacio,
                comparativo_primer_ingreso: comparativo,
                integrantes_por_equipo: equipos
            }
        });
    } catch (error) {
        console.error('Error resumen:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

module.exports = router;