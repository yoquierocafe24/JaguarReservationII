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

module.exports = router;