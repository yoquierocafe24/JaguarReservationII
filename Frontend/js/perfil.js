// ======================================
// PERFIL DEL ESTUDIANTE
// ======================================

const ESPACIOS = {
    1: { nombre: "Cancha de fútbol", icono: "⚽" },
    2: { nombre: "Cancha de baloncesto", icono: "🏀" },
    3: { nombre: "Cancha de  voleibol", icono: "🏐" },
    4: { nombre: "Zona Jaguar", icono: "🎮" }
};


// Guarda las reservas cargadas para utilizarlas
// en los modales de detalles y QR.
let reservasEstudiante = [];


// ======================================
// Formatear una fecha
// ======================================

function formatearFecha(fecha) {

    if (!fecha) {
        return "";
    }

    // Evita problemas cuando MySQL devuelve:
    // 2026-07-23T06:00:00.000Z
    const fechaLimpia =
        String(fecha).substring(0, 10);

    const fechaObjeto =
        new Date(`${fechaLimpia}T00:00:00`);

    if (Number.isNaN(fechaObjeto.getTime())) {
        return fechaLimpia;
    }

    return fechaObjeto.toLocaleDateString(
        "es-HN",
        {
            day: "2-digit",
            month: "long",
            year: "numeric"
        }
    );
}


// ======================================
// Obtener fecha y hora de una reserva
// ======================================

function construirFechaHora(fecha, hora) {

    if (!fecha || !hora) {
        return null;
    }

    const fechaLimpia =
        String(fecha).substring(0, 10);

    const horaLimpia =
        String(hora).substring(0, 8);

    const resultado =
        new Date(`${fechaLimpia}T${horaLimpia}`);

    return Number.isNaN(resultado.getTime())
        ? null
        : resultado;
}


// ======================================
// Saber si una reserva ya terminó
// ======================================

function reservaEstaVencida(reserva) {

    const fechaFin =
        construirFechaHora(
            reserva.fecha,
            reserva.hora_fin
        );

    if (!fechaFin) {
        return false;
    }

    return fechaFin < new Date();
}


// ======================================
// Estado visual
// ======================================

function obtenerEstadoVisual(reserva) {

    const estadoReal =
        reserva.estado || "pendiente";

    if (
        reservaEstaVencida(reserva) &&
        !["cancelada", "rechazada"].includes(estadoReal)
    ) {
        return {
            valor: "vencida",
            etiqueta: "Vencida"
        };
    }

    const etiquetas = {
        pendiente: "Pendiente",
        aprobada: "Aprobada",
        cancelada: "Cancelada",
        rechazada: "Rechazada"
    };

    return {
        valor: estadoReal,
        etiqueta:
            etiquetas[estadoReal] || estadoReal
    };
}


// ======================================
// Datos del espacio
// ======================================

function espacioDe(reserva) {

    if (
        reserva.id_espacio &&
        ESPACIOS[reserva.id_espacio]
    ) {
        return ESPACIOS[reserva.id_espacio];
    }

    if (
        reserva.id_item ||
        reserva.id_espacio == 4
    ) {
        return ESPACIOS[4];
    }

    return {
        nombre: "Espacio del polideportivo",
        icono: "bi-geo-alt"
    };
}


// ======================================
// Saber si puede cancelar
// ======================================

function reservaPuedeCancelarse(reserva) {

    if (
        !["pendiente", "aprobada"].includes(
            reserva.estado
        )
    ) {
        return false;
    }

    const fechaInicio =
        construirFechaHora(
            reserva.fecha,
            reserva.hora_inicio
        );

    if (!fechaInicio) {
        return false;
    }

    // Solo puede cancelar antes de que inicie.
    return fechaInicio > new Date();
}


// ======================================
// Saber si debe mostrar QR
// ======================================

function reservaTieneQR(reserva) {

    if (!reserva.qr_token) {
        return false;
    }

    if (
        ["cancelada", "rechazada"].includes(
            reserva.estado
        )
    ) {
        return false;
    }

    if (reservaEstaVencida(reserva)) {
        return false;
    }

    return true;
}


// ======================================
// Cargar datos del perfil
// ======================================

async function cargarPerfil() {

    try {

        const respuesta = await fetch(
            "http://localhost:3000/api/auth/session",
            {
                credentials: "include"
            }
        );

        const data = await respuesta.json();

        if (
            !respuesta.ok ||
            !data.ok ||
            !data.usuario
        ) {
            window.location.href =
                "../../login.html";

            return;
        }

        if (data.usuario.rol !== "estudiante") {
            window.location.href =
                "../../login.html";

            return;
        }

        const usuario =
            data.usuario;

        const nombre =
            usuario.nombre || "Estudiante";

        document
            .getElementById("perfil-nombre")
            .textContent = nombre;

        document
            .getElementById("perfil-cuenta")
            .textContent =
                usuario.cuenta || "—";

     const correoElemento =
    document.getElementById("perfil-correo");

if (correoElemento) {
    correoElemento.textContent =
        usuario.correo || "—";
}

        const avatar =
            nombre
                .split(" ")
                .filter(Boolean)
                .map(parte => parte[0])
                .join("")
                .substring(0, 2)
                .toUpperCase();

        document
            .getElementById("perfil-avatar")
            .textContent = avatar;

    } catch (error) {

        console.error(
            "Error cargando perfil:",
            error
        );
    }
}


// ======================================
// Actualizar contadores
// ======================================

function actualizarEstadisticas(reservas) {

    const aprobadas =
        reservas.filter(reserva => {
            return (
                reserva.estado === "aprobada" &&
                !reservaEstaVencida(reserva)
            );
        }).length;

    const pendientes =
        reservas.filter(reserva => {
            return (
                reserva.estado === "pendiente" &&
                !reservaEstaVencida(reserva)
            );
        }).length;

    document
        .getElementById("stat-aprobadas")
        .textContent = aprobadas;

    document
        .getElementById("stat-pendientes")
        .textContent = pendientes;

    document
        .getElementById("stat-total")
        .textContent = reservas.length;
}

// function colocarTexto(id, valor) {

   // const elemento =
     //   document.getElementById(id);

   // if (elemento) {
       // elemento.textContent = valor;
   // }
// }


// ======================================
// Renderizar reservas
// ======================================

function renderizarReservas(reservas) {

    const contenedor =
        document.getElementById(
            "lista-reservas"
        );

    if (reservas.length === 0) {

        contenedor.innerHTML = `
            <div class="reservas-empty">
                <i class="bi bi-calendar-x"></i>
                Aún no tienes reservas.
            </div>
        `;

        return;
    }

    const reservasOrdenadas =
        [...reservas].sort((a, b) => {

            const fechaA =
                construirFechaHora(
                    a.fecha,
                    a.hora_inicio
                );

            const fechaB =
                construirFechaHora(
                    b.fecha,
                    b.hora_inicio
                );

            return (
                (fechaB?.getTime() || 0) -
                (fechaA?.getTime() || 0)
            );
        });

    contenedor.innerHTML =
        reservasOrdenadas.map(reserva => {

            const espacio =
                espacioDe(reserva);

            const estadoVisual =
                obtenerEstadoVisual(reserva);

            const horaInicio =
                reserva.hora_inicio
                    ? String(
                        reserva.hora_inicio
                    ).substring(0, 5)
                    : "";

            const horaFin =
                reserva.hora_fin
                    ? String(
                        reserva.hora_fin
                    ).substring(0, 5)
                    : "";

            const horario =
                horaInicio && horaFin
                    ? `${horaInicio} – ${horaFin}`
                    : "";

            const puedeCancelar =
                reservaPuedeCancelarse(reserva);

            const tieneQR =
                reservaTieneQR(reserva);

            return `
                <div class="reserva-row">

                       <div class="reserva-icono">
                     ${espacio.icono}
                      </div>

                    <div class="reserva-info">

                        <div class="n">
                            ${espacio.nombre}
                        </div>

                        <div class="s">
                            ${formatearFecha(reserva.fecha)}
                            ${horario ? " · " + horario : ""}
                        </div>

                    </div>

                    <span class="reserva-codigo">
                        ${reserva.id_reserva || ""}
                    </span>

                    <span class="
                        badge-estado
                        badge-${estadoVisual.valor}
                    ">
                        ${estadoVisual.etiqueta}
                    </span>

                    <div class="reserva-acciones">

                        <button
                            class="btn-detalle-reserva"
                            onclick="verDetalleReserva('${reserva.id_reserva}')"
                        >
                            <i class="bi bi-eye"></i>
                            Detalles
                        </button>

                        ${
                            tieneQR
                                ? `
                                    <button
                                        class="btn-qr-reserva"
                                        onclick="verQrReserva('${reserva.id_reserva}')"
                                    >
                                        <i class="bi bi-qr-code"></i>
                                        Ver QR
                                    </button>
                                `
                                : ""
                        }

                        ${
                            puedeCancelar
                                ? `
                                    <button
                                        class="btn-cancelar-reserva"
                                        onclick="cancelarReserva('${reserva.id_reserva}')"
                                    >
                                        <i class="bi bi-x-lg"></i>
                                        Cancelar
                                    </button>
                                `
                                : ""
                        }

                    </div>

                </div>
            `;

        }).join("");
}


// ======================================
// Cargar reservas
// ======================================

async function cargarReservas() {

    const contenedor =
        document.getElementById(
            "lista-reservas"
        );

    try {

        const respuesta = await fetch(
            "http://localhost:3000/api/reservas",
            {
                credentials: "include"
            }
        );

        const data = await respuesta.json();

        if (
            !respuesta.ok ||
            !data.ok
        ) {
            contenedor.innerHTML = `
                <div class="reservas-empty">
                    <i class="bi bi-exclamation-circle"></i>
                    No se pudieron cargar tus reservas.
                </div>
            `;

            return;
        }

        reservasEstudiante =
            data.reservas || [];

        actualizarEstadisticas(
            reservasEstudiante
        );

        renderizarReservas(
            reservasEstudiante
        );

    } catch (error) {

        console.error(
            "Error cargando reservas:",
            error
        );

        contenedor.innerHTML = `
            <div class="reservas-empty">
                <i class="bi bi-exclamation-circle"></i>
                No se pudieron cargar tus reservas.
            </div>
        `;
    }
}


// ======================================
// Buscar reserva localmente
// ======================================

function obtenerReserva(idReserva) {

    return reservasEstudiante.find(
        reserva =>
            reserva.id_reserva === idReserva
    );
}


// ======================================
// Mostrar detalles
// ======================================

function verDetalleReserva(idReserva) {

    const reserva =
        obtenerReserva(idReserva);

    if (!reserva) {
        return;
    }

    const espacio =
        espacioDe(reserva);

    const estadoVisual =
        obtenerEstadoVisual(reserva);

    const horaInicio =
        String(
            reserva.hora_inicio || ""
        ).substring(0, 5);

    const horaFin =
        String(
            reserva.hora_fin || ""
        ).substring(0, 5);

    document
        .getElementById("detalle-codigo")
        .textContent =
            reserva.id_reserva;

    document
        .getElementById("detalle-espacio")
        .textContent =
            espacio.nombre;

    document
        .getElementById("detalle-fecha")
        .textContent =
            formatearFecha(reserva.fecha);

    document
        .getElementById("detalle-hora")
        .textContent =
            `${horaInicio} – ${horaFin}`;

    document
        .getElementById("detalle-estado")
        .textContent =
            estadoVisual.etiqueta;

    document
        .getElementById("detalle-acompanantes")
        .textContent =
            Number(
                reserva.cant_acompanantes
            ) || 0;

    document
        .getElementById("detalle-solicitud")
        .textContent =
            reserva.solicitud_especial ||
            "Ninguna";

    const modal =
        new bootstrap.Modal(
            document.getElementById(
                "modalDetalleReserva"
            )
        );

    modal.show();
}


// ======================================
// Mostrar QR
// ======================================

async function verQrReserva(idReserva) {

    const reserva =
        obtenerReserva(idReserva);

    if (
        !reserva ||
        !reservaTieneQR(reserva)
    ) {
        return;
    }

    const cargando =
        document.getElementById(
            "qr-modal-cargando"
        );

    const imagen =
        document.getElementById(
            "qr-modal-imagen"
        );

    const mensaje =
        document.getElementById(
            "qr-modal-mensaje"
        );

    document
        .getElementById("qr-modal-codigo")
        .textContent =
            reserva.id_reserva;

    cargando.hidden = false;
    imagen.hidden = true;
    mensaje.hidden = true;

    const modal =
        new bootstrap.Modal(
            document.getElementById(
                "modalQrReserva"
            )
        );

    modal.show();

    try {

        const respuesta = await fetch(
            `http://localhost:3000/api/qr/${encodeURIComponent(idReserva)}/qr`,
            {
                credentials: "include"
            }
        );

        if (!respuesta.ok) {

            const error = await respuesta
                .json()
                .catch(() => null);

            throw new Error(
                error?.mensaje ||
                "No se pudo cargar el código QR."
            );
        }

        const blob =
            await respuesta.blob();

        imagen.src =
            URL.createObjectURL(blob);

        cargando.hidden = true;
        imagen.hidden = false;

    } catch (error) {

        console.error(
            "Error cargando QR:",
            error
        );

        cargando.hidden = true;
        imagen.hidden = true;

        mensaje.textContent =
            error.message;

        mensaje.hidden = false;
    }
}


// ======================================
// Cancelar reserva
// ======================================

async function cancelarReserva(idReserva) {

    const confirmar =
        window.confirm(
            "¿Seguro que deseas cancelar esta reserva?"
        );

    if (!confirmar) {
        return;
    }

    try {

        const respuesta = await fetch(
            `http://localhost:3000/api/reservas/${encodeURIComponent(idReserva)}/cancelar`,
            {
                method: "PUT",
                credentials: "include"
            }
        );

        const data =
            await respuesta.json();

        if (
            !respuesta.ok ||
            !data.ok
        ) {
            alert(
                data.mensaje ||
                "No se pudo cancelar la reserva."
            );

            return;
        }

        await cargarReservas();

    } catch (error) {

        console.error(
            "Error cancelando reserva:",
            error
        );

        alert(
            "No se pudo cancelar la reserva."
        );
    }
}


// ======================================
// Menú responsive
// ======================================

function abrirMenu() {

    document
        .querySelector(".sidebar")
        .classList.add("activo");

    document
        .querySelector(".overlay")
        .classList.add("activo");
}


function cerrarMenu() {

    document
        .querySelector(".sidebar")
        .classList.remove("activo");

    document
        .querySelector(".overlay")
        .classList.remove("activo");
}


// ======================================
// Cerrar sesión
// ======================================

async function cerrarSesion() {

    try {

        const respuesta = await fetch(
            "http://localhost:3000/api/auth/logout",
            {
                method: "POST",
                credentials: "include"
            }
        );

        const data =
            await respuesta.json();

        if (data.ok) {

            sessionStorage.clear();

            window.location.href =
                "../../login.html";
        }

    } catch (error) {

        console.error(error);
    }
}


// ======================================
// Inicialización
// ======================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await cargarPerfil();
        await cargarReservas();

    }
);