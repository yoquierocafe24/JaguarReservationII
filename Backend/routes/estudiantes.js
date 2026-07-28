const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const db = require("../db");

const upload = multer({
    dest: "uploads/"
});

router.post("/estudiantes/subir", upload.single("archivo"), async (req, res) => {

    try {

        if (!req.file) {

            return res.status(400).json({
                ok: false,
                mensaje: "No se recibió ningún archivo"
            });

        }

        const workbook = XLSX.readFile(req.file.path);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const datos = XLSX.utils.sheet_to_json(sheet, {
            header: 1
        });

        const cuentasExcel = [];

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

            cuentasExcel.push(cuenta);

            const [existe] = await db.query(

                "SELECT id_estudiante FROM Estudiantes WHERE cuenta=?",
                [cuenta]

            );

            if (existe.length > 0) {

                await db.query(

                    `UPDATE Estudiantes
                     SET nombre=?,
                         dni=?,
                         correo=?,
                         carrera=?,
                         tipo_ingreso=?,
                         activo=1
                     WHERE cuenta=?`,

                    [nombre, dni, correo, carrera, tipo_ingreso, cuenta]

                );

            } else {

                await db.query(

                    `INSERT INTO Estudiantes
                    (nombre,dni,cuenta,correo,carrera,tipo_ingreso,activo)
                    VALUES (?,?,?,?,?,?,1)`,

                    [nombre, dni, cuenta, correo, carrera, tipo_ingreso]

                );

            }

        }

        if (cuentasExcel.length > 0) {

            const placeholders = cuentasExcel.map(() => "?").join(",");

            await db.query(

                `UPDATE Estudiantes
                 SET activo=0
                 WHERE cuenta NOT IN (${placeholders})`,

                cuentasExcel

            );

        }

        res.json({

            ok: true,
            estudiantesProcesados: cuentasExcel.length

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
// OBTENER TODOS LOS ESTUDIANTES
// ========================================

router.get("/estudiantes", async (req, res) => {

    try {

        const [rows] = await db.query(

            `SELECT
                id_estudiante,
                cuenta,
                nombre,
                correo,
                carrera,
                tipo_ingreso,
                activo
            FROM Estudiantes
            ORDER BY nombre`

        );

        res.json({
            ok: true,
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

        const [resultado] = await db.query(

            `UPDATE Estudiantes
             SET activo = 0`

        );

        res.json({

            ok: true,
            mensaje: "Trimestre cerrado correctamente.",

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
// ESTADISTICAS
// ========================================

router.get("/estudiantes/resumen", async (req, res) => {

    try {

        const [[total]] = await db.query(

            `SELECT COUNT(*) total
             FROM Estudiantes`

        );

        const [[activos]] = await db.query(

            `SELECT COUNT(*) activos
             FROM Estudiantes
             WHERE activo=1`

        );

        const [[inactivos]] = await db.query(

            `SELECT COUNT(*) inactivos
             FROM Estudiantes
             WHERE activo=0`

        );

        res.json({

            ok:true,

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