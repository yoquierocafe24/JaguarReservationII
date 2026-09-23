// routes/reportes.js — Modulo de Reportes (Jaguar Reserva)
// Consultas de solo lectura que AGRUPAN y CUENTAN datos ya existentes
// (Estudiantes, Reservas, Espacios y Equipos/Clubes). No crea tablas nuevas.
//
// Endpoints:
//   GET /api/reportes/reservas-por-carrera      -> reservas agrupadas por carrera
//   GET /api/reportes/reservas-por-espacio      -> reservas agrupadas por espacio
//   GET /api/reportes/primer-ingreso            -> comparativo primer ingreso vs reingreso
//   GET /api/reportes/integrantes-por-equipo    -> cantidad de integrantes por equipo
//   GET /api/reportes/integrantes-por-club      -> cantidad de integrantes por club
//   GET /api/reportes/resumen                   -> reporte institucional completo (para exportar)
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

    // ---- Filtro de fecha de corte (reporte parcial) ----
    // Si se indica fecha_corte, se limita todo a fechas <=
    // esa fecha, sin importar qué tan lejos llegue el periodo
    // seleccionado. Útil para generar un reporte "a medio
    // trimestre" (ej: hasta la semana 5 de 10).
    if (q.fecha_corte) {
        condiciones.push('r.fecha <= ?');
        params.push(q.fecha_corte);
    }

    // ---- Filtros adicionales ----
    if (q.carrera) {
        // COLLATE utf8mb4_general_ci trata "Psicologia" y "Psicología"
        // (o "INGENIERIA" y "Ingeniería") como la misma carrera, sin
        // importar mayúsculas ni tildes. Esto evita que reservas queden
        // "invisibles" solo porque el Excel institucional escribió la
        // carrera distinto en cargas diferentes.
        condiciones.push('ep.carrera COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci');
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

// -------------------------------------------------------------
// Igual que construirFiltros, pero para los accesos LIBRES
// (tabla asistencia con id_reserva = NULL). Como no nacen de
// una reserva, no hay r.fecha / r.id_espacio / r.estado que
// filtrar — se usan los campos propios de asistencia:
//   - a.fecha_entrada en vez de r.fecha
//   - a.id_espacio en vez de r.id_espacio
//   - carrera/tipo_ingreso del estudiante que entró (a.id_estudiante),
//     no del titular de una reserva que no existe.
// No hay equivalente de r.estado ni r.id_equipo para un acceso
// libre, así que esos dos filtros simplemente no aplican aquí.
// -------------------------------------------------------------
function construirFiltrosLibre(q) {
    const condiciones = [];
    const params = [];

    if (q.fecha_inicio && q.fecha_fin) {
        condiciones.push('a.fecha_entrada BETWEEN ? AND ?');
        params.push(q.fecha_inicio, q.fecha_fin);

    } else if (q.id_periodo) {
        condiciones.push(
            'a.fecha_entrada BETWEEN (SELECT fecha_inicio FROM periodo_academico WHERE id_periodo = ?) ' +
            'AND (SELECT fecha_fin FROM periodo_academico WHERE id_periodo = ?)'
        );
        params.push(q.id_periodo, q.id_periodo);

    } else if (q.periodo === 'anual' && q.anio) {
        condiciones.push('YEAR(a.fecha_entrada) = ?');
        params.push(q.anio);

    } else if (q.periodo === 'trimestral' && q.anio && q.trimestre) {
        const t = Number(q.trimestre);
        const mesInicio = (t - 1) * 3 + 1;
        const mesFin = mesInicio + 2;
        const inicio = `${q.anio}-${String(mesInicio).padStart(2, '0')}-01`;
        const fin = new Date(Number(q.anio), mesFin, 0).toISOString().slice(0, 10);
        condiciones.push('a.fecha_entrada BETWEEN ? AND ?');
        params.push(inicio, fin);
    }

    if (q.fecha_corte) {
        condiciones.push('a.fecha_entrada <= ?');
        params.push(q.fecha_corte);
    }

    if (q.id_espacio) {
        condiciones.push('a.id_espacio = ?');
        params.push(q.id_espacio);
    }

    if (q.carrera) {
        // Ver comentario equivalente en construirFiltros().
        condiciones.push('ep.carrera COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci');
        params.push(q.carrera);
    }

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

        // Carreras que ya no existen en las cargas actuales del
        // archivo institucional (quedaron de estudiantes cuyo
        // último registro conocido es de una carga vieja). Se
        // OCULTAN aquí del desplegable únicamente — no se borra
        // nada de la base de datos. Si en algún momento vuelven a
        // aparecer en un archivo real, basta con quitarlas de esta
        // lista.
        const CARRERAS_OCULTAS = [
            'Psicologia',
            'Diseño grafico',
            'Informatica'
        ];

        // Solo se muestran las carreras que ALGÚN estudiante tiene
        // como su registro más reciente (SUBQUERY_ULTIMO_PERIODO).
        // Además, se AGRUPAN por nombre sin importar mayúsculas ni
        // tildes (COLLATE utf8mb4_general_ci): así "Psicologia" y
        // "Psicología" cuentan como una sola opción en el filtro,
        // en vez de aparecer como dos carreras "distintas" solo
        // porque el Excel institucional las escribió diferente en
        // cargas distintas. MIN() elige un solo texto representativo
        // por grupo para mostrar.
        const [carreras] = await db.query(
            `SELECT MIN(ep.carrera) AS carrera
             FROM ${SUBQUERY_ULTIMO_PERIODO} ep
             WHERE ep.carrera IS NOT NULL AND ep.carrera <> ''
             AND ep.carrera COLLATE utf8mb4_general_ci NOT IN (${CARRERAS_OCULTAS.map(() => '? COLLATE utf8mb4_general_ci').join(',')})
             GROUP BY ep.carrera COLLATE utf8mb4_general_ci
             ORDER BY carrera`,
            CARRERAS_OCULTAS
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
            `SELECT MIN(COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera')) AS carrera,
                    COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera') COLLATE utf8mb4_general_ci
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
// 4) Cantidad de INTEGRANTES por EQUIPO
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
// 4b) Cantidad de INTEGRANTES por CLUB
// =============================================================
router.get('/integrantes-por-club', async (req, res) => {
    try {
        const params = [];
        let filtroClub = '';
        if (req.query.id_club) {
            filtroClub = 'AND c.id_club = ?';
            params.push(req.query.id_club);
        }

        const [rows] = await db.query(
            `SELECT c.id_club,
                    c.nombre AS club,
                    COUNT(ci.id_estudiante) AS cantidad_integrantes
             FROM clubes c
             LEFT JOIN club_integrantes ci
                    ON ci.id_club = c.id_club AND ci.activo = 1
             WHERE c.activo = 1 ${filtroClub}
             GROUP BY c.id_club, c.nombre
             ORDER BY cantidad_integrantes DESC`,
            params
        );

        res.json({ ok: true, reporte: 'integrantes_por_club', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error integrantes-por-club:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 4c) RESERVAS hechas por cada EQUIPO
// (distinto de "integrantes-por-equipo": esto cuenta cuántas
// veces reservó cada equipo, no cuántos miembros tiene)
// =============================================================
router.get('/reservas-por-equipo', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [rows] = await db.query(
            `SELECT
                eq.id_equipo,
                eq.nombre AS equipo,
                eq.deporte,
                COUNT(r.id_reserva) AS total_reservas
             FROM equipos eq
             INNER JOIN reservas r
                ON r.id_equipo = eq.id_equipo
                AND r.tipo_reserva = 'equipo'
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY eq.id_equipo, eq.nombre, eq.deporte
             ORDER BY total_reservas DESC`,
            params
        );

        res.json({ ok: true, reporte: 'reservas_por_equipo', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error reservas-por-equipo:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 4d) RESERVAS hechas por cada CLUB
// (distinto de "integrantes-por-club": esto cuenta cuántas
// veces reservó cada club, no cuántos miembros tiene)
// =============================================================
router.get('/reservas-por-club', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [rows] = await db.query(
            `SELECT
                c.id_club,
                c.nombre AS club,
                COUNT(r.id_reserva) AS total_reservas
             FROM clubes c
             INNER JOIN reservas r
                ON r.id_club = c.id_club
                AND r.tipo_reserva = 'club'
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY c.id_club, c.nombre
             ORDER BY total_reservas DESC`,
            params
        );

        res.json({ ok: true, reporte: 'reservas_por_club', filtros: req.query, total_grupos: rows.length, datos: rows });
    } catch (error) {
        console.error('Error reservas-por-club:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});


//
// Acepta un filtro adicional opcional:
//   fecha_corte = YYYY-MM-DD
// Si se indica, TODO el reporte se limita a reservas con
// fecha <= fecha_corte, útil para un reporte parcial dentro
// de un periodo/trimestre que todavía no ha terminado.
// =============================================================
router.get('/resumen', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);

        const [porCarrera] = await db.query(
            `SELECT MIN(COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera')) AS carrera, COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula} GROUP BY COALESCE(NULLIF(ep.carrera, ''), 'Sin carrera') COLLATE utf8mb4_general_ci ORDER BY total_reservas DESC`,
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

        const [clubes] = await db.query(
            `SELECT c.id_club, c.nombre AS club,
                    COUNT(ci.id_estudiante) AS cantidad_integrantes
             FROM clubes c
             LEFT JOIN club_integrantes ci ON ci.id_club = c.id_club AND ci.activo = 1
             WHERE c.activo = 1
             GROUP BY c.id_club, c.nombre
             ORDER BY cantidad_integrantes DESC`
        );

        // =======================================
        // Reservas hechas por cada equipo/club
        // (distinto de "integrantes": esto es
        // cuántas veces reservó cada uno, respeta
        // el mismo filtro de fecha del resumen).
        // =======================================

        const [reservasPorEquipo] = await db.query(
            `SELECT eq.id_equipo, eq.nombre AS equipo, eq.deporte,
                    COUNT(r.id_reserva) AS total_reservas
             FROM equipos eq
             INNER JOIN reservas r
                ON r.id_equipo = eq.id_equipo
                AND r.tipo_reserva = 'equipo'
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY eq.id_equipo, eq.nombre, eq.deporte
             ORDER BY total_reservas DESC`,
            params
        );

        const [reservasPorClub] = await db.query(
            `SELECT c.id_club, c.nombre AS club,
                    COUNT(r.id_reserva) AS total_reservas
             FROM clubes c
             INNER JOIN reservas r
                ON r.id_club = c.id_club
                AND r.tipo_reserva = 'club'
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY c.id_club, c.nombre
             ORDER BY total_reservas DESC`,
            params
        );

        // =======================================
        // Asistencias registradas (KPI)
        //
        // Se calculan por separado:
        //   - "por reserva": alguien marcado presente en una
        //     reserva real (titular/acompañante/integrante).
        //   - "libres": accesos libres (sin reserva) registrados
        //     por el guardia.
        // El total mostrado es la suma de ambas.
        // =======================================

        const [asistenciaRows] = await db.query(
            `SELECT
                COUNT(*) AS total_asistencias,
                COUNT(DISTINCT a.id_reserva) AS reservas_con_asistencia
             FROM asistencia a
             INNER JOIN reservas r ON r.id_reserva = a.id_reserva
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}`,
            params
        );

        const asistenciaPorReserva = asistenciaRows[0] || {
            total_asistencias: 0,
            reservas_con_asistencia: 0
        };

        const { clausula: clausulaLibre, params: paramsLibre } = construirFiltrosLibre(req.query);

        const [librasRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM asistencia a
             JOIN estudiantes e ON e.id_estudiante = a.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE a.tipo_ingreso = 'libre'
             ${clausulaLibre}`,
            paramsLibre
        );

        const asistenciasLibres = Number(librasRows[0]?.total || 0);
        const asistenciasPorReserva = Number(asistenciaPorReserva.total_asistencias || 0);

        const asistencia = {
            // Suma de ambas: toda entrada registrada, con o sin reserva
            total_asistencias: asistenciasPorReserva + asistenciasLibres,

            // Desglose
            asistencias_por_reserva: asistenciasPorReserva,
            asistencias_libres: asistenciasLibres,

            // Esto sigue siendo específico de reservas (no aplica a libres)
            reservas_con_asistencia: asistenciaPorReserva.reservas_con_asistencia
        };

        // =======================================
        // Reservas por ESTADO (aprobadas, canceladas,
        // rechazadas, pendientes)
        // =======================================

        const [estadosRows] = await db.query(
            `SELECT r.estado, COUNT(*) AS total
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY r.estado`,
            params
        );

        const porEstado = { aprobada: 0, pendiente: 0, cancelada: 0, rechazada: 0 };
        estadosRows.forEach(f => { porEstado[f.estado] = Number(f.total); });

        // =======================================
        // Reservas APROBADAS sin ninguna asistencia
        // registrada ("nadie llegó")
        // =======================================

        const [noShowRows] = await db.query(
            `SELECT COUNT(*) AS reservas_sin_asistencia
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN asistencia a ON a.id_reserva = r.id_reserva
             WHERE r.estado = 'aprobada' ${clausula}
             AND a.id_asistencia IS NULL`,
            params
        );

        const reservasSinAsistencia = noShowRows[0]?.reservas_sin_asistencia || 0;

        // =======================================
        // Juego más reservado (Zona Jaguar)
        // =======================================

        const [juegosRows] = await db.query(
            `SELECT i.nombre AS juego, COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             JOIN inventario i ON i.id_item = r.id_item
             WHERE r.id_item IS NOT NULL ${clausula}
             GROUP BY i.id_item, i.nombre
             ORDER BY total_reservas DESC`,
            params
        );

        // =======================================
        // Día de la semana más transitado
        // =======================================

        const [diasRows] = await db.query(
            `SELECT
                CASE DAYOFWEEK(r.fecha)
                    WHEN 1 THEN 'Domingo'
                    WHEN 2 THEN 'Lunes'
                    WHEN 3 THEN 'Martes'
                    WHEN 4 THEN 'Miércoles'
                    WHEN 5 THEN 'Jueves'
                    WHEN 6 THEN 'Viernes'
                    WHEN 7 THEN 'Sábado'
                END AS dia,
                COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY DAYOFWEEK(r.fecha), dia
             ORDER BY total_reservas DESC`,
            params
        );

        // =======================================
        // Hora más transitada
        // =======================================

        const [horasRows] = await db.query(
            `SELECT
                r.hora_inicio AS hora,
                COUNT(*) AS total_reservas
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}
             GROUP BY r.hora_inicio
             ORDER BY total_reservas DESC`,
            params
        );

        // =======================================
        // Estudiantes (de los que reservaron en
        // este periodo/filtro) que también son
        // integrantes activos de algún club
        // =======================================

        const [estudiantesEnClubesRows] = await db.query(
            `SELECT COUNT(DISTINCT r.id_estudiante) AS total
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             INNER JOIN club_integrantes ci
                ON ci.id_estudiante = r.id_estudiante
                AND ci.activo = 1
             WHERE 1 = 1 ${clausula}`,
            params
        );

        const estudiantesEnClubes = estudiantesEnClubesRows[0]?.total || 0;

        res.json({
            ok: true,
            reporte: 'resumen_general',
            filtros: req.query,
            datos: {
                reservas_por_carrera: porCarrera,
                reservas_por_espacio: porEspacio,
                comparativo_primer_ingreso: comparativo,
                integrantes_por_equipo: equipos,
                integrantes_por_club: clubes,
                reservas_por_equipo: reservasPorEquipo,
                reservas_por_club: reservasPorClub,
                asistencia: asistencia,

                // Reporte institucional extendido
                reservas_por_estado: porEstado,
                reservas_sin_asistencia: reservasSinAsistencia,
                juego_mas_reservado: juegosRows,
                dia_mas_transitado: diasRows,
                hora_mas_transitada: horasRows,
                estudiantes_en_clubes: estudiantesEnClubes
            }
        });
    } catch (error) {
        console.error('Error resumen:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// Helper de paginación reusable: lee page/pageSize del query,
// con límites razonables para no permitir pedir "todo" de un
// jalón (eso tumbaría el servidor con miles de filas).
// =============================================================
function leerPaginacion(q) {
    // Para exportar: sin_limite=1 trae TODAS las filas que
    // coincidan con los filtros, sin paginar. Se usa solo desde
    // los botones de exportar PDF/Excel/CSV, nunca desde las
    // tablas en pantalla (esas sí siempre paginan).
    if (q.sin_limite === '1') {
        return { pagina: 1, porPagina: null, offset: 0, sinLimite: true };
    }

    const pagina = Math.max(1, parseInt(q.pagina, 10) || 1);
    const porPagina = Math.min(200, Math.max(10, parseInt(q.por_pagina, 10) || 50));
    const offset = (pagina - 1) * porPagina;
    return { pagina, porPagina, offset, sinLimite: false };
}

// =============================================================
// 6) LISTADO DETALLADO — una fila por cada reserva (no agrupado)
//
// Muestra exactamente lo que pide la administración: código,
// quién la hizo, espacio, fecha/hora, estado, y si el TITULAR
// pertenece a algún club o equipo (sin importar si la reserva
// en sí fue individual, de equipo o de club — un estudiante
// puede ser del Club de Ajedrez y aun así reservar cancha solo).
//
// Como un estudiante puede pertenecer a más de un club/equipo
// a la vez, esas dos columnas usan GROUP_CONCAT para juntar
// todos los nombres separados por coma, en vez de duplicar filas.
//
// GET /api/reportes/listado-detallado?pagina=1&por_pagina=50
// (acepta los mismos filtros que /resumen: fecha_inicio,
// fecha_fin, id_periodo, carrera, id_espacio, estado, etc.)
// =============================================================
router.get('/listado-detallado', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);
        const { pagina, porPagina, offset, sinLimite } = leerPaginacion(req.query);

        const [totalRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausula}`,
            params
        );

        const [rows] = await db.query(
            `SELECT
                r.id_reserva,
                e.nombre AS titular_nombre,
                e.cuenta AS titular_cuenta,
                COALESCE(es.nombre, 'Sin espacio') AS espacio,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                r.tipo_reserva,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.nombre SEPARATOR ', ')
                    FROM club_integrantes ci
                    INNER JOIN clubes c ON c.id_club = ci.id_club
                    WHERE ci.id_estudiante = r.id_estudiante
                    AND ci.activo = 1
                ) AS club_pertenece,
                (
                    SELECT GROUP_CONCAT(DISTINCT eq.nombre SEPARATOR ', ')
                    FROM equipo_integrantes ei
                    INNER JOIN equipos eq ON eq.id_equipo = ei.id_equipo
                    WHERE ei.id_estudiante = r.id_estudiante
                    AND ei.activo = 1
                ) AS equipo_pertenece
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN espacios es ON es.id_espacio = r.id_espacio
             WHERE 1 = 1 ${clausula}
             ORDER BY r.fecha DESC, r.hora_inicio DESC
             ${sinLimite ? '' : 'LIMIT ? OFFSET ?'}`,
            sinLimite ? params : [...params, porPagina, offset]
        );

        res.json({
            ok: true,
            reporte: 'listado_detallado',
            filtros: req.query,
            total: totalRows[0]?.total || 0,
            pagina,
            por_pagina: sinLimite ? rows.length : porPagina,
            datos: rows
        });
    } catch (error) {
        console.error('Error listado-detallado:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 7) LISTADO DE RESERVAS DE CLUB — solo reservas hechas COMO
// club (tipo_reserva = 'club'), con el nombre del club, quién
// la hizo (el líder/sublíder que reservó) y cuántos integrantes
// tenía el club en ese momento.
//
// GET /api/reportes/listado-clubes?pagina=1&por_pagina=50
// =============================================================
router.get('/listado-clubes', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);
        const { pagina, porPagina, offset, sinLimite } = leerPaginacion(req.query);

        const clausulaClub = `${clausula} AND r.tipo_reserva = 'club'`;

        const [totalRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE 1 = 1 ${clausulaClub}`,
            params
        );

        const [rows] = await db.query(
            `SELECT
                r.id_reserva,
                c.nombre AS club,
                e.nombre AS titular_nombre,
                e.cuenta AS titular_cuenta,
                COALESCE(es.nombre, 'Sin espacio') AS espacio,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                r.estado,
                (
                    SELECT COUNT(*)
                    FROM club_integrantes ci
                    WHERE ci.id_club = r.id_club
                    AND ci.activo = 1
                ) AS cantidad_integrantes
             FROM reservas r
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN espacios es ON es.id_espacio = r.id_espacio
             LEFT JOIN clubes c ON c.id_club = r.id_club
             WHERE 1 = 1 ${clausulaClub}
             ORDER BY r.fecha DESC, r.hora_inicio DESC
             ${sinLimite ? '' : 'LIMIT ? OFFSET ?'}`,
            sinLimite ? params : [...params, porPagina, offset]
        );

        res.json({
            ok: true,
            reporte: 'listado_clubes',
            filtros: req.query,
            total: totalRows[0]?.total || 0,
            pagina,
            por_pagina: sinLimite ? rows.length : porPagina,
            datos: rows
        });
    } catch (error) {
        console.error('Error listado-clubes:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// =============================================================
// 8) LISTADO DE ACOMPAÑANTES — una fila por cada persona que se
// unió a una reserva individual (por QR o vinculada por un
// guardia), mostrando a qué reserva pertenece y quién es el
// titular de esa reserva.
//
// Los filtros de fecha aplican sobre la FECHA DE LA RESERVA
// (r.fecha), no sobre cuándo se registró el acompañante.
//
// GET /api/reportes/listado-acompanantes?pagina=1&por_pagina=50
// =============================================================
router.get('/listado-acompanantes', async (req, res) => {
    try {
        const { clausula, params } = construirFiltros(req.query);
        const { pagina, porPagina, offset, sinLimite } = leerPaginacion(req.query);

        // construirFiltros() genera condiciones sobre alias "r"
        // (reservas) y "ep" (período del TITULAR) — funcionan
        // igual aquí, ya que reserva_acompanantes cuelga de "r".
        const [totalRows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM reserva_acompanantes ra
             INNER JOIN reservas r ON r.id_reserva = ra.id_reserva
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             WHERE ra.confirmado = 1 ${clausula}`,
            params
        );

        const [rows] = await db.query(
            `SELECT
                r.id_reserva,
                e.nombre AS titular_nombre,
                e.cuenta AS titular_cuenta,
                acomp.nombre AS acompanante_nombre,
                acomp.cuenta AS acompanante_cuenta,
                COALESCE(es.nombre, 'Sin espacio') AS espacio,
                r.fecha,
                r.hora_inicio,
                r.hora_fin,
                ra.origen,
                ra.fecha_registro
             FROM reserva_acompanantes ra
             INNER JOIN reservas r ON r.id_reserva = ra.id_reserva
             JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
             LEFT JOIN ${SUBQUERY_ULTIMO_PERIODO} ep ON ep.id_estudiante = e.id_estudiante
             LEFT JOIN espacios es ON es.id_espacio = r.id_espacio
             INNER JOIN estudiantes acomp ON acomp.id_estudiante = ra.id_estudiante
             WHERE ra.confirmado = 1 ${clausula}
             ORDER BY r.fecha DESC, r.hora_inicio DESC
             ${sinLimite ? '' : 'LIMIT ? OFFSET ?'}`,
            sinLimite ? params : [...params, porPagina, offset]
        );

        res.json({
            ok: true,
            reporte: 'listado_acompanantes',
            filtros: req.query,
            total: totalRows[0]?.total || 0,
            pagina,
            por_pagina: sinLimite ? rows.length : porPagina,
            datos: rows
        });
    } catch (error) {
        console.error('Error listado-acompanantes:', error);
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

module.exports = router;