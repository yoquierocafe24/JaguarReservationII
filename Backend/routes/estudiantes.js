const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");

const upload = multer({
    dest: "uploads/"
});

// ========================================
// HELPERS DE PERIODOS
// ========================================

function formatearFecha(fecha) {

    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');

    return `${anio}-${mes}-${dia}`;
}

function construirNombrePeriodo(fecha) {

    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;

    let trimestre;

    if (mes >= 1 && mes <= 3) {
        trimestre = 1;
    } else if (mes >= 4 && mes <= 6) {
        trimestre = 2;
    } else if (mes >= 7 && mes <= 9) {
        trimestre = 3;
    } else {
        trimestre = 4;
    }

    return `${anio}-T${trimestre}`;
}

async function crearNuevoPeriodo() {

    const fechaInicio = new Date();

    const fechaFin = new Date(fechaInicio);
    fechaFin.setMonth(fechaFin.getMonth() + 3);
    fechaFin.setDate(fechaFin.getDate() - 1); // Para que termine un día antes del siguiente trimestre

    const nombre = construirNombrePeriodo(fechaInicio);

    const [resultado] = await db.query(

        `INSERT INTO periodo_academico (nombre, fecha_inicio, fecha_fin, estado)
         VALUES (?, ?, ?, 'Activo')`,

        [
            nombre,
            formatearFecha(fechaInicio),
            formatearFecha(fechaFin)
        ]

    );

    return {
        id_periodo: resultado.insertId,
        nombre,
        fecha_inicio: formatearFecha(fechaInicio),
        fecha_fin: formatearFecha(fechaFin),
        estado: 'Activo'
    };
}

async function obtenerPeriodoActivo() {

    const [rows] = await db.query(

        `SELECT id_periodo
         FROM periodo_academico
         WHERE estado = 'Activo'
         LIMIT 1`

    );

    return rows.length > 0 ? rows[0].id_periodo : null;

}

// ========================================
// SUBIR EXCEL DE ESTUDIANTES (por periodo)
// ========================================

router.post("/estudiantes/subir", upload.single("archivo"), async (req, res) => {

    try {

        if (!req.file) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún archivo"
            });

        }

        let id_periodo = req.body.id_periodo;

        if (!id_periodo) {
            id_periodo = await obtenerPeriodoActivo();
        }

        if (!id_periodo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No hay un periodo académico activo ni se especificó id_periodo"
            });

        }

        const workbook = XLSX.readFile(req.file.path);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const datos = XLSX.utils.sheet_to_json(sheet, {
            header: 1
        });

        const idsEstudiantesExcel = [];

        for (let i = 1; i < datos.length; i++) {

            const fila = datos[i];

            const cuenta = fila[0];
            const nombre = fila[1];
            const dni = fila[2];
            const correo = fila[30];
            const carrera = fila[7];
            const tipo_ingreso = fila[10];

            if (!cuenta || !nombre || !dni)
                continue;

            // 1. Upsert en Estudiantes (datos fijos del alumno)

            const [existeEstudiante] = await db.query(

                "SELECT id_estudiante FROM estudiantes WHERE cuenta=?",
                [cuenta]

            );

            let id_estudiante;

            if (existeEstudiante.length > 0) {

                id_estudiante = existeEstudiante[0].id_estudiante;

                await db.query(

                    `UPDATE estudiantes
                     SET nombre=?,
                         dni=?,
                         correo=?
                     WHERE id_estudiante=?`,

                    [nombre, dni, correo, id_estudiante]

                );

            } else {

                const [resultado] = await db.query(

                    `INSERT INTO estudiantes
                    (nombre,dni,cuenta,correo)
                    VALUES (?,?,?,?)`,

                    [nombre, dni, cuenta, correo]

                );

                id_estudiante = resultado.insertId;

            }

            // 2. Upsert en Estudiante_Periodo (datos del alumno para ese periodo)

            const [existePeriodo] = await db.query(

                `SELECT id FROM estudiante_periodo
                 WHERE id_estudiante=? AND id_periodo=?`,

                [id_estudiante, id_periodo]

            );

            if (existePeriodo.length > 0) {

                await db.query(

                    `UPDATE estudiante_periodo
                     SET carrera=?,
                         tipo_ingreso=?,
                         activo=1
                     WHERE id=?`,

                    [carrera, tipo_ingreso, existePeriodo[0].id]

                );

            } else {

                await db.query(

                    `INSERT INTO estudiante_periodo
                    (id_estudiante,id_periodo,carrera,tipo_ingreso,activo)
                    VALUES (?,?,?,?,1)`,

                    [id_estudiante, id_periodo, carrera, tipo_ingreso]

                );

            }

            idsEstudiantesExcel.push(id_estudiante);

        }

        if (idsEstudiantesExcel.length > 0) {

            const placeholders = idsEstudiantesExcel.map(() => "?").join(",");

            await db.query(

                `UPDATE estudiante_periodo
                 SET activo=0
                 WHERE id_periodo=? AND id_estudiante NOT IN (${placeholders})`,

                [id_periodo, ...idsEstudiantesExcel]

            );

        }

        res.json({

            ok: true,
            id_periodo,
            estudiantesProcesados: idsEstudiantesExcel.length

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({

            ok: false,
            mensaje: error.message

        });

    }

});

// ========================================
// OBTENER PERIODOS ACADÉMICOS
// ========================================

router.get("/estudiantes/periodos", async (req, res) => {

    try {

        const [rows] = await db.query(

            `SELECT id_periodo, nombre, fecha_inicio, fecha_fin, estado
             FROM periodo_academico
             ORDER BY fecha_inicio DESC, id_periodo DESC`

        );

        const [activoRows] = await db.query(

            `SELECT id_periodo
             FROM periodo_academico
             WHERE estado='Activo'
             LIMIT 1`

        );

        res.json({
            ok: true,
            periodos: rows,
            periodoActivo: activoRows[0]?.id_periodo || null
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: error.message
        });

    }

});

// ========================================
// OBTENER TODOS LOS ESTUDIANTES (de un periodo)
// ========================================

router.get("/estudiantes", async (req, res) => {

    try {

        let id_periodo = req.query.id_periodo;

        const mostrarTodos =
            req.query.todos === '1' ||
            req.query.todos === 'true' ||
            id_periodo === 'todos' ||
            id_periodo === 'all';

        if (!id_periodo && !mostrarTodos) {
            id_periodo = await obtenerPeriodoActivo();
        }

        if (!id_periodo && !mostrarTodos) {

            return res.status(400).json({
                ok: false,
                mensaje: "No hay un periodo académico activo ni se especificó id_periodo"
            });

        }

        let rows;

        if (mostrarTodos) {

            [rows] = await db.query(

                `SELECT
                    e.id_estudiante,
                    e.cuenta,
                    e.nombre,
                    e.correo,
                    ep.carrera,
                    ep.tipo_ingreso,
                    ep.activo,
                    ep.id_periodo,
                    pa.nombre AS periodo_nombre
                FROM estudiantes e
                INNER JOIN estudiante_periodo ep
                    ON ep.id_estudiante = e.id_estudiante
                INNER JOIN periodo_academico pa
                    ON pa.id_periodo = ep.id_periodo
                ORDER BY pa.fecha_inicio DESC, e.nombre`

            );

        } else {

            [rows] = await db.query(

                `SELECT
                    e.id_estudiante,
                    e.cuenta,
                    e.nombre,
                    e.correo,
                    ep.carrera,
                    ep.tipo_ingreso,
                    ep.activo
                FROM estudiantes e
                INNER JOIN estudiante_periodo ep
                    ON ep.id_estudiante = e.id_estudiante
                WHERE ep.id_periodo = ?
                ORDER BY e.nombre`,

                [id_periodo]

            );

        }

        res.json({
            ok: true,
            id_periodo,
            estudiantes: rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: error.message
        });

    }

});

// ========================================
// CERRAR TRIMESTRE
// ========================================

router.put("/estudiantes/cerrar-trimestre", async (req, res) => {

    try {

        let id_periodo = req.body.id_periodo;

        if (!id_periodo) {
            id_periodo = await obtenerPeriodoActivo();
        }

        if (!id_periodo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No hay un periodo académico activo ni se especificó id_periodo"
            });

        }

        if (!id_periodo) {
            id_periodo = await obtenerPeriodoActivo();
        }

        if (!id_periodo) {
            const nuevoPeriodo = await crearNuevoPeriodo();

            return res.json({
                ok: true,
                mensaje: "Se inició un nuevo periodo académico.",
                id_periodo: nuevoPeriodo.id_periodo,
                periodo_nuevo: nuevoPeriodo
            });
        }

        const [resultado] = await db.query(

            `UPDATE estudiante_periodo
             SET activo = 0
             WHERE id_periodo = ?`,

            [id_periodo]

        );

        await db.query(

            `UPDATE periodo_academico
             SET estado = 'Finalizado'
             WHERE id_periodo = ?`,

            [id_periodo]

        );

        const periodoNuevo = await crearNuevoPeriodo();

        res.json({

            ok: true,
            mensaje: "Trimestre cerrado correctamente. Se inició un nuevo periodo académico.",
            id_periodo,
            periodo_nuevo: periodoNuevo,
            estudiantesActualizados: resultado.affectedRows

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            ok: false,
            mensaje: error.message

        });

    }

});

// ========================================
// INACTIVAR ESTUDIANTE INDIVIDUALMENTE
// ========================================

router.put(
    "/estudiantes/:id_estudiante/inactivar",
    async (req, res) => {

        try {

            const id_estudiante =
                req.params.id_estudiante;

            let id_periodo =
                req.body.id_periodo ||
                req.query.id_periodo;

            if (!id_periodo) {
                id_periodo =
                    await obtenerPeriodoActivo();
            }

            if (!id_periodo) {
                return res.status(400).json({
                    ok: false,
                    mensaje:
                        "No hay un periodo académico activo ni se especificó id_periodo"
                });
            }

            // 1. Inactivar al estudiante en el período
            const [resultadoPeriodo] =
                await db.query(

                    `UPDATE estudiante_periodo
                     SET activo = 0
                     WHERE id_estudiante = ?
                     AND id_periodo = ?`,

                    [
                        id_estudiante,
                        id_periodo
                    ]
                );

            if (
                resultadoPeriodo.affectedRows === 0
            ) {
                return res.status(404).json({
                    ok: false,
                    mensaje:
                        "No se encontró el estudiante en el periodo seleccionado"
                });
            }

            // 2. Inactivar también en la tabla general
            await db.query(

                `UPDATE estudiantes
                 SET activo = 0
                 WHERE id_estudiante = ?`,

                [id_estudiante]
            );

            return res.json({
                ok: true,
                mensaje:
                    "Estudiante inactivado correctamente",
                id_estudiante,
                id_periodo
            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({
                ok: false,
                mensaje: error.message
            });
        }
    }
);

// ========================================
// ESTADISTICAS (de un periodo)
// ========================================

router.get("/estudiantes/resumen", async (req, res) => {

    try {

        let id_periodo = req.query.id_periodo;

        if (!id_periodo) {
            id_periodo = await obtenerPeriodoActivo();
        }

        if (!id_periodo) {

            return res.status(400).json({
                ok: false,
                mensaje: "No hay un periodo académico activo ni se especificó id_periodo"
            });

        }

        const [[total]] = await db.query(

            `SELECT COUNT(*) total
             FROM estudiante_periodo
             WHERE id_periodo=?`,

            [id_periodo]

        );

        const [[activos]] = await db.query(

            `SELECT COUNT(*) activos
             FROM estudiante_periodo
             WHERE id_periodo=? AND activo=1`,

            [id_periodo]

        );

        const [[inactivos]] = await db.query(

            `SELECT COUNT(*) inactivos
             FROM estudiante_periodo
             WHERE id_periodo=? AND activo=0`,

            [id_periodo]

        );

        res.json({

            ok:true,

            id_periodo,

            total: total.total,

            activos: activos.activos,

            inactivos: inactivos.inactivos

        });

    } catch(error){

        console.log(error);

        res.status(500).json({

            ok:false,

            mensaje:error.message

        });

    }

});


module.exports = router;