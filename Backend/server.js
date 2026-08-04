// server.js — Punto de entrada del backend Jaguar Reserva

const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

// Inicializa la conexión a la base de datos
require('./db');

// =======================
// Importación de rutas
// =======================

const authRoutes = require('./routes/auth');
const reservasRoutes = require('./routes/reservas');
//const estudiantesRoutes = require('./routes/estudiantes');
const estudiantesRoutes = require('./routes/estudiantes');
const inventarioRoutes = require('./routes/inventario');
const guardiasRoutes = require('./routes/guardias');
const qrRoutes = require('./routes/qr');



const app = express();

// =======================
// Middlewares
// =======================

// Permite recibir JSON
app.use(express.json());

// Permite comunicación con el Frontend
//app.use(cors({
  //  origin: true,
  //  credentials: true
//}));

//probando a ver
app.set("trust proxy", 1);

app.use(cors({
    origin: [
        "http://localhost",
        "http://127.0.0.1",
        "http://127.0.0.1:5500",
        "https://jaguar-reservation-ii.vercel.app"
    ],
    credentials: true
}));

// Manejo de sesiones
/* app.use(session({
    secret: process.env.SESSION_SECRET || 'jaguar_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 4 // 4 horas
    }
})); */

//Probando a ver
app.use(session({
    secret:
        process.env.SESSION_SECRET ||
        "jaguar_secreto",

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,

        // Necesario porque Railway usa HTTPS
        secure: true,

        // Permite enviar la cookie entre
        // localhost y Railway
        sameSite: "none",

        maxAge: 1000 * 60 * 60 * 4
    }
}));


// =======================
// Ruta principal
// =======================

app.get('/', (req, res) => {
    res.json({
        ok: true,
        mensaje: 'API Jaguar Reservation funcionando correctamente'
    });
});

// =======================
// Rutas de la API
// =======================

app.use('/api/auth', authRoutes);
app.use('/api/reservas', reservasRoutes);
 app.use('/', estudiantesRoutes);
//app.use('/api/estudiantes', estudiantesRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/guardias', guardiasRoutes);
app.use('/api/qr', qrRoutes);


// =======================
// Puerto del servidor
// =======================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en: http://localhost:${PORT}`);
});