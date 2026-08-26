const express = require('express');
const router = express.Router();
const db = require('../db');

// =====================================
// VALIDACIÓN DE ADMINISTRADOR
// =====================================
function requiereAdmin(req, res, next) {

    if (!req.session.usuario) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Debe iniciar sesión.'
        });
    }

    if (req.session.usuario.rol !== 'admin') {
        return res.status(403).json({
            ok: false,
            mensaje: 'No tiene permisos para realizar esta acción.'
        });
    }

    next();
}

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
router.post('/items', requiereAdmin, async (req, res) => {

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
router.put('/items/:id', requiereAdmin, async (req, res) => {

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

        const cantidad = Number(cantidad_total);

        if (!Number.isInteger(cantidad) || cantidad < 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La cantidad total debe ser un número entero mayor o igual a cero.'
            });
        }

        // Verificar que el item exista
        const [existente] = await db.query(
            `SELECT id_item, categoria
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

        const categoriaFinal =
            categoria && String(categoria).trim()
                ? String(categoria).trim()
                : existente[0].categoria;

        // =====================================
        // ADVERTENCIA POR CANTIDAD RESERVADA
        // =====================================

        const [reservasPorHorario] = await db.query(
            `SELECT
                fecha,
                hora_inicio,
                hora_fin,
                COUNT(*) AS total_reservado
             FROM reservas
             WHERE id_item = ?
               AND fecha >= CURDATE()
               AND estado IN ('pendiente', 'aprobada')
             GROUP BY fecha, hora_inicio, hora_fin
             ORDER BY total_reservado DESC`,
            [id]
        );

        const cantidadMaximaReservada =
            reservasPorHorario.length > 0
                ? Math.max(
                    ...reservasPorHorario.map(
                        r => Number(r.total_reservado)
                    )
                )
                : 0;

        let advertencia = null;

        if (cantidad < cantidadMaximaReservada) {
            advertencia = {
                tipo: 'cantidad_menor_a_reservada',
                mensaje:
                    `La nueva cantidad (${cantidad}) es menor que la cantidad máxima ya reservada simultáneamente (${cantidadMaximaReservada}). El cambio fue permitido, pero existen reservas que podrían verse afectadas.`,
                cantidad_nueva: cantidad,
                cantidad_maxima_reservada: cantidadMaximaReservada,
                horarios_afectados: reservasPorHorario.filter(
                    r => Number(r.total_reservado) > cantidad
                )
            };
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
                categoriaFinal,
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
            advertencia,
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

// =====================================
// LISTAR TODOS LOS ITEMS - ADMIN
// =====================================
router.get('/items', requiereAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total,
                descripcion,
                estado
            FROM inventario
            ORDER BY
                CASE WHEN estado = 'activo' THEN 0 ELSE 1 END,
                nombre ASC
        `);

        return res.json({
            ok: true,
            items: rows
        });

    } catch (error) {
        console.error('ERROR LISTANDO ITEMS:', error);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo obtener el inventario.'
        });
    }
});

// =====================================
// REACTIVAR ITEM - ADMIN
// =====================================
router.patch('/items/:id/reactivar', requiereAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const [items] = await db.query(
            `SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total,
                descripcion,
                estado
             FROM inventario
             WHERE id_item = ?
             LIMIT 1`,
            [id]
        );

        if (items.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'El item no existe.'
            });
        }

        const item = items[0];

        if (item.estado === 'activo') {
            return res.status(400).json({
                ok: false,
                mensaje: 'El item ya se encuentra activo.'
            });
        }

        await db.query(
            `UPDATE inventario
             SET estado = 'activo'
             WHERE id_item = ?`,
            [id]
        );

        return res.json({
            ok: true,
            mensaje: 'Item reactivado correctamente.',
            item: {
                ...item,
                estado: 'activo'
            }
        });

    } catch (error) {
        console.error('ERROR REACTIVANDO ITEM:', error);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo reactivar el item.'
        });
    }
});

// =====================================
// INACTIVAR ITEM - ADMIN
// =====================================
router.patch('/items/:id/inactivar', requiereAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { confirmar = false } = req.body;

        const [items] = await db.query(
            `SELECT
                id_item,
                nombre,
                categoria,
                cantidad_total,
                descripcion,
                estado
             FROM inventario
             WHERE id_item = ?
             LIMIT 1`,
            [id]
        );

        if (items.length === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'El item no existe.'
            });
        }

        const item = items[0];

        if (item.estado === 'inactivo') {
            return res.status(400).json({
                ok: false,
                mensaje: 'El item ya se encuentra inactivo.'
            });
        }

        const [reservas] = await db.query(
            `SELECT
                id_reserva,
                id_estudiante,
                fecha,
                hora_inicio,
                hora_fin,
                estado
             FROM reservas
             WHERE id_item = ?
               AND fecha >= CURDATE()
               AND estado IN ('pendiente', 'aprobada')
             ORDER BY fecha ASC, hora_inicio ASC`,
            [id]
        );

        // Hay reservas futuras y todavía no se confirmó
        if (reservas.length > 0 && confirmar !== true) {
            return res.status(409).json({
                ok: false,
                requiere_confirmacion: true,
                mensaje:
                    'Este item tiene reservas futuras. Revise las reservas afectadas antes de confirmar la inactivación.',
                item,
                total_reservas_afectadas: reservas.length,
                reservas_afectadas: reservas
            });
        }

        await db.query(
            `UPDATE inventario
             SET estado = 'inactivo'
             WHERE id_item = ?`,
            [id]
        );

        return res.json({
            ok: true,
            mensaje: 'Item inactivado correctamente.',
            item: {
                ...item,
                estado: 'inactivo'
            },
            reservas_afectadas: reservas
        });

    } catch (error) {
        console.error('ERROR INACTIVANDO ITEM:', error);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo inactivar el item.'
        });
    }
});

module.exports = router;