const db = require('../db');
const crypto = require('crypto');

// =======================================
// Revisa que haya sesión Y que el token
// guardado en la sesión coincida con el
// que está registrado en sesiones_activas.
//
// Si alguien inició sesión en otro
// dispositivo, el token de la base de datos
// ya cambió — entonces esta sesión antigua
// queda invalidada automáticamente.
// =======================================

async function requiereSesion(req, res, next) {

    if (!req.session.usuario) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Debe iniciar sesión.'
        });
    }

    try {

        const [rows] = await db.query(
            `SELECT token
             FROM sesiones_activas
             WHERE rol = ? AND id_usuario = ?`,
            [req.session.usuario.rol, req.session.usuario.id]
        );

        const tokenValido =
            rows.length > 0 &&
            rows[0].token === req.session.token;

        if (!tokenValido) {

            req.session.destroy(() => {});

            return res.status(401).json({
                ok: false,
                mensaje: 'Tu sesión fue cerrada porque iniciaste sesión en otro dispositivo.'
            });

        }

        next();

    } catch (error) {

        console.error('ERROR VALIDANDO SESIÓN:', error);

        res.status(500).json({
            ok: false,
            mensaje: 'Error del servidor.'
        });

    }

}

function requiereAdmin(req, res, next) {
    if (req.session.usuario.rol !== 'admin') {
        return res.status(403).json({
            ok: false,
            mensaje: 'No tiene permisos.'
        });
    }
    next();
}

function requiereSuperAdmin(req, res, next) {
    if (
        req.session.usuario.rol !== 'admin' ||
        !req.session.usuario.es_superadmin
    ) {
        return res.status(403).json({
            ok: false,
            mensaje: 'Solo el administrador principal puede realizar esta acción.'
        });
    }
    next();
}

function requiereEstudiante(req, res, next) {
    if (req.session.usuario.rol !== 'estudiante') {
        return res.status(403).json({
            ok: false,
            mensaje: 'No tiene permisos para realizar esta acción.'
        });
    }
    next();
}

function requiereGuardia(req, res, next) {
    if (req.session.usuario.rol !== 'guardia') {
        return res.status(403).json({
            ok: false,
            mensaje: 'No tiene permisos.'
        });
    }
    next();
}

// =======================================
// Genera un token nuevo para un usuario y
// lo guarda en sesiones_activas, reemplazando
// cualquier token anterior (gracias al
// UNIQUE KEY de la tabla). Se usa al iniciar
// sesión, en los 3 logins (admin/estudiante/
// guardia).
// =======================================

async function generarTokenSesion(rol, idUsuario) {

    const token = crypto.randomUUID();

    await db.query(
        `INSERT INTO sesiones_activas (rol, id_usuario, token)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            token = VALUES(token),
            creado_en = CURRENT_TIMESTAMP`,
        [rol, idUsuario, token]
    );

    return token;
}

module.exports = {
    requiereSesion,
    requiereAdmin,
    requiereSuperAdmin,
    requiereEstudiante,
    requiereGuardia,
    generarTokenSesion
};