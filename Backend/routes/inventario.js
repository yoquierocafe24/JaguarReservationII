const express = require('express');
const router = express.Router();
const db = require('../db');

// =====================================
// OBTENER JUEGOS ACTIVOS
// =====================================
router.get('/juegos', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total
            FROM inventario
            WHERE estado = 'activo'
            ORDER BY nombre
        `);

        res.json({
            ok: true,
            juegos: rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error al obtener el inventario.'
        });

    }

});

// =====================================
// OBTENER HORARIOS AGOTADOS DE UN JUEGO
// =====================================
router.get('/horarios-agotados', async (req, res) => {

    try {

        const { fecha, id_item } = req.query;

        if (!fecha || !id_item) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debe enviar la fecha y el juego.'
            });
        }

        // Obtener la cantidad total disponible del juego
        const [items] = await db.query(
            `SELECT cantidad_total
             FROM inventario
             WHERE id_item = ?
               AND estado = 'activo'
             LIMIT 1`,
            [id_item]
        );

        if (items.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'El juego no existe o está inactivo.'
            });
        }

        const cantidadTotal =
            Number(items[0].cantidad_total);

        // Contar cuántas reservas existen por horario
        const [reservas] = await db.query(
            `SELECT
                hora_inicio,
                hora_fin,
                COUNT(*) AS total_reservado

             FROM reservas

             WHERE fecha = ?
               AND id_item = ?
               AND estado IN ('pendiente', 'aprobada')

             GROUP BY hora_inicio, hora_fin`,
            [fecha, id_item]
        );

        // Solo bloquear horarios donde ya se agotó el juego
        const horariosAgotados = reservas
            .filter(
                reserva =>
                    Number(reserva.total_reservado) >=
                    cantidadTotal
            )
            .map(reserva => ({
                hora_inicio: reserva.hora_inicio,
                hora_fin: reserva.hora_fin
            }));

        return res.json({
            ok: true,
            cantidad_total: cantidadTotal,
            horarios_agotados: horariosAgotados
        });

    } catch (error) {

        console.error(
            'ERROR CONSULTANDO HORARIOS AGOTADOS:',
            error
        );

        return res.status(500).json({
            ok: false,
            mensaje:
                'No se pudieron consultar los horarios disponibles.'
        });

    }

});

// =====================================
// CREAR ITEM - ADMINISTRACIÓN ZONA JAGUAR
// =====================================
router.post('/items', async (req, res) => {

    try {

        const {
            nombre,
            categoria,
            cantidad_total,
            descripcion
        } = req.body;

        // Validar nombre
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El nombre del item es obligatorio.'
            });
        }

        // La categoría es obligatoria.
        // La lista fija todavía no se valida porque está pendiente
        // de definición por parte del cliente.
        if (!categoria || !categoria.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La categoría es obligatoria.'
            });
        }

        const cantidad = Number(cantidad_total);

        if (!Number.isInteger(cantidad) || cantidad < 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La cantidad total debe ser un número entero mayor o igual a cero.'
            });
        }

        const [resultado] = await db.query(
            `INSERT INTO inventario
                (nombre, categoria, cantidad_total, descripcion, estado)
             VALUES (?, ?, ?, ?, 'activo')`,
            [
                nombre.trim(),
                categoria.trim(),
                cantidad,
                descripcion ? descripcion.trim() : null
            ]
        );

        const [itemCreado] = await db.query(
            `SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total,
                descripcion,
                estado
             FROM inventario
             WHERE id_item = ?`,
            [resultado.insertId]
        );

        return res.status(201).json({
            ok: true,
            mensaje: 'Item creado correctamente.',
            item: itemCreado[0]
        });

    } catch (error) {

        console.error('ERROR AL CREAR ITEM:', error);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo crear el item.'
        });

    }

});

// =====================================
// EDITAR ITEM - ADMINISTRACIÓN ZONA JAGUAR
// =====================================
router.put('/items/:id', async (req, res) => {

    try {

        const { id } = req.params;

        const {
            nombre,
            categoria,
            cantidad_total,
            descripcion
        } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El nombre del item es obligatorio.'
            });
        }

        if (!categoria || !categoria.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La categoría es obligatoria.'
            });
        }

        const cantidad = Number(cantidad_total);

        if (!Number.isInteger(cantidad) || cantidad < 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La cantidad total debe ser un número entero mayor o igual a cero.'
            });
        }

        // Verificar que el item exista
        const [existente] = await db.query(
            `SELECT id_item
             FROM inventario
             WHERE id_item = ?
             LIMIT 1`,
            [id]
        );

        if (existente.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'El item no existe.'
            });
        }

        await db.query(
            `UPDATE inventario
             SET
                nombre = ?,
                categoria = ?,
                cantidad_total = ?,
                descripcion = ?
             WHERE id_item = ?`,
            [
                nombre.trim(),
                categoria.trim(),
                cantidad,
                descripcion ? descripcion.trim() : null,
                id
            ]
        );

        const [itemActualizado] = await db.query(
            `SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total,
                descripcion,
                estado
             FROM inventario
             WHERE id_item = ?`,
            [id]
        );

        return res.json({
            ok: true,
            mensaje: 'Item actualizado correctamente.',
            item: itemActualizado[0]
        });

    } catch (error) {

        console.error('ERROR AL EDITAR ITEM:', error);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo actualizar el item.'
        });

    }

});

module.exports = router;