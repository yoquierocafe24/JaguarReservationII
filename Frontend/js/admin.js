const API_URL =
    "https://jaguarreservationii-production.up.railway.app";

let reservasAdmin = [];


// =======================================
// INICIAR DASHBOARD
// =======================================

document.addEventListener("DOMContentLoaded", async () => {

    mostrarFechaActual();

    const sesionValida = await cargarSesionAdmin();

    if (!sesionValida) {
        return;
    }

    await Promise.all([
        cargarReservas(),
        // cargarEquipos(),
        cargarEstudiantes()
    ]);

});


// =======================================
// SESIÓN DEL ADMINISTRADOR
// =======================================

async function cargarSesionAdmin() {

    try {

        const respuesta = await fetch(
            `${API_URL}/api/auth/session`,
            {
                credentials:"include"
            }
        );

        const data = await respuesta.json();

        if (
            !respuesta.ok ||
            !data.ok ||
            data.usuario?.rol !== "admin"
        ) {

            window.location.href =
            
                "../../login.html";

            return false;
        }

       const nombre =
            data.usuario.nombre || "Administradora";

        document.getElementById("usuario-nombre").textContent =
            nombre;

        document.getElementById("welcome-name").textContent =
            primerNombre(nombre);

        document.getElementById("usuario-avatar").textContent =
            obtenerIniciales(nombre);

            
        return true;

    } catch (error) {

        console.error(
            "Error cargando la sesión del administrador:",
            error
        );

        mostrarToast(
            "No se pudo verificar la sesión.",
            "danger"
        );

        return false;
    }

}


// =======================================
// FECHA
// =======================================

function mostrarFechaActual() {

    const ahora = new Date();

    const fecha = ahora.toLocaleDateString(
        "es-HN",
        {
            weekday:"long",
            day:"numeric",
            month:"long",
            year:"numeric"
        }
    );

    const hora = ahora.toLocaleTimeString(
        "es-HN",
        {
            hour:"2-digit",
            minute:"2-digit"
        }
    );

    const fechaFinal =
        fecha.charAt(0).toUpperCase() +
        fecha.slice(1);

    document.getElementById("topbar-date").textContent =
        `${fechaFinal} · ${hora}`;

}


// =======================================
// RESERVAS
// =======================================

async function cargarReservas() {

    try {

        const respuesta = await fetch(
            `${API_URL}/api/reservas`,
            {
                credentials:"include"
            }
        );

        const data = await respuesta.json();

        if (!respuesta.ok || !data.ok) {

            throw new Error(
                data.mensaje ||
                "No se pudieron cargar las reservas."
            );
        }
     
        reservasAdmin = Array.isArray(data.reservas)
            ? data.reservas
            : [];
 console.table(reservasAdmin);
        actualizarDatosReservas();

    } catch (error) {

        console.error(
            "Error cargando reservas:",
            error
        );

        reservasAdmin = [];

        actualizarDatosReservas();

        mostrarToast(
            "No se pudieron cargar las reservas.",
            "danger"
        );
    }

}

function actualizarDatosReservas() {

    const hoy = obtenerFechaLocal();

    const reservasHoy = reservasAdmin.filter(reserva => {

        return (
            obtenerSoloFecha(reserva.fecha) === hoy &&
            !["cancelada", "rechazada"].includes(reserva.estado)
        );

    });

    const pendientes = reservasAdmin.filter(reserva => {
    if (reserva.estado !== "pendiente") {
        return false;
    }

    const fechaFin = construirFechaHora(
        reserva.fecha,
        reserva.hora_fin
    );

    return fechaFin >= new Date();
});

    const proximas = reservasAdmin
        .filter(reserva => {

            if (
                ["cancelada", "rechazada"].includes(
                    reserva.estado
                )
            ) {
                return false;
            }

            const fechaHora = construirFechaHora(
                reserva.fecha,
                reserva.hora_inicio
            );

            return fechaHora >= new Date();

        })
        .sort((a, b) => {

            return (
                construirFechaHora(
                    a.fecha,
                    a.hora_inicio
                ) -
                construirFechaHora(
                    b.fecha,
                    b.hora_inicio
                )
            );

        })
        .slice(0, 5);


    // Tarjetas superiores

    const totalReservasHoy =
        document.getElementById("total-reservas-hoy");

    const totalPendientes =
        document.getElementById("total-pendientes");

    const bannerReservas =
        document.getElementById("banner-reservas");

    const bannerPendientes =
        document.getElementById("banner-pendientes");


    if (totalReservasHoy) {
        totalReservasHoy.textContent =
            reservasHoy.length;
    }

    if (totalPendientes) {
        totalPendientes.textContent =
            pendientes.length;
    }

    if (bannerReservas) {
        bannerReservas.textContent =
            reservasHoy.length;
    }

    if (bannerPendientes) {
        bannerPendientes.textContent =
            pendientes.length;
    }


    // Listas del dashboard

    renderizarPendientes(
        pendientes.slice(0, 4)
    );

    renderizarProximasReservas(
        proximas
    );

    renderizarEstadoEspacios(
        reservasHoy
    );

}
// =======================================
// PENDIENTES
// =======================================

function renderizarPendientes(reservas) {

    const lista =
        document.getElementById("pending-list");

    lista.innerHTML = "";

    if (!reservas.length) {

        lista.innerHTML = `
            <div class="empty-panel">

                <i class="bi bi-check-circle"></i>

                <p>
                    No hay solicitudes pendientes.
                </p>

            </div>
        `;

        return;
    }

    reservas.forEach(reserva => {

        const item =
            document.createElement("div");

        item.className = "pending-item";

        item.innerHTML = `
            <div class="item-icon">
                ${obtenerEmojiEspacio(reserva)}
            </div>

            <div class="item-main">

                <strong>
                    ${escaparHTML(
                        obtenerNombreEspacio(reserva)
                    )}
                </strong>

                <small>
                    ${formatearFecha(reserva.fecha)}
                    ·
                    ${formatearHora(reserva.hora_inicio)}
                    –
                    ${formatearHora(reserva.hora_fin)}
                </small>

            </div>

            <span class="item-code">
                ${escaparHTML(reserva.id_reserva)}
            </span>

            <span class="item-status status-pending">
                Pendiente
            </span>
        `;

        lista.appendChild(item);

    });

}


// =======================================
// PRÓXIMAS RESERVAS
// =======================================

function renderizarProximasReservas(reservas) {

    const lista =
        document.getElementById("upcoming-list");

    lista.innerHTML = "";

    if (!reservas.length) {

        lista.innerHTML = `
            <div class="empty-panel">

                <i class="bi bi-calendar2-x"></i>

                <p>
                    No hay próximas reservas.
                </p>

            </div>
        `;

        return;
    }

    reservas.forEach(reserva => {

        const item =
            document.createElement("div");

        item.className = "upcoming-item";

        item.innerHTML = `
            <div class="item-icon">
                ${obtenerEmojiEspacio(reserva)}
            </div>

            <div class="item-main">

                <strong>
                    ${escaparHTML(
                        obtenerNombreEspacio(reserva)
                    )}
                </strong>

                <small>
                    ${formatearFecha(reserva.fecha)}
                    ·
                    ${formatearHora(reserva.hora_inicio)}
                    –
                    ${formatearHora(reserva.hora_fin)}
                    ·
                    ${
                        Number(
                            reserva.cant_acompanantes || 0
                        ) + 1
                    }
                    persona(s)
                </small>

            </div>

            <span class="item-code">
                ${escaparHTML(reserva.id_reserva)}
            </span>

            <span class="
                item-status
                ${claseEstado(reserva.estado)}
            ">
                ${textoEstado(reserva.estado)}
            </span>
        `;

        lista.appendChild(item);

    });

}


// =======================================
// ESTADO DE ESPACIOS
// =======================================

function renderizarEstadoEspacios(reservasHoy) {

    const ahora = new Date();

    const espacios = [
        {
            id:1,
            nombre:"Cancha de fútbol",
            emoji:"⚽"
        },
        {
            id:2,
            nombre:"Cancha de voleibol",
            emoji:"🏐"
        },
        {
            id:3,
            nombre:"Cancha de baloncesto",
            emoji:"🏀"
        },
        {
            id:4,
            nombre:"Zona Jaguar",
            emoji:"🎮"
        }
    ];

    const lista =
        document.getElementById("spaces-list");

    lista.innerHTML = "";

    espacios.forEach(espacio => {

        const ocupada = reservasHoy.some(reserva => {

            if (
                Number(reserva.id_espacio) !==
                espacio.id
            ) {
                return false;
            }

            const inicio =
                construirFechaHora(
                    reserva.fecha,
                    reserva.hora_inicio
                );

            const fin =
                construirFechaHora(
                    reserva.fecha,
                    reserva.hora_fin
                );

            return ahora >= inicio && ahora <= fin;

        });

        const item =
            document.createElement("div");

        item.className = "space-item";

        item.innerHTML = `
            <div class="space-name">

                <span class="space-emoji">
                    ${espacio.emoji}
                </span>

                ${espacio.nombre}

            </div>

            <span class="
                item-status
                ${ocupada ? "status-busy" : "status-free"}
            ">
                ${ocupada ? "Ocupada" : "Libre"}
            </span>
        `;

        lista.appendChild(item);

    });

}


// =======================================
// EQUIPOS
// =======================================

async function cargarEquipos() {

    try {

        const respuesta = await fetch(
            `${API_URL}/api/equipos`,
            {
                credentials:"include"
            }
        );

        const data = await respuesta.json();

        if (!respuesta.ok || !data.ok) {
            throw new Error();
        }

        const equipos = Array.isArray(data.equipos)
            ? data.equipos
            : [];

        const activos = equipos.filter(
            equipo =>
                Number(equipo.activo) === 1
        ).length;

        document.getElementById(
            "total-equipos"
        ).textContent = activos;

    } catch (error) {

        document.getElementById(
            "total-equipos"
        ).textContent = "0";

    }

}


// =======================================
// ESTUDIANTES
// =======================================

async function cargarEstudiantes() {
    try {
        const respuesta = await fetch(
            `${API_URL}/estudiantes`,
            {
                credentials: "include"
            }
        );

        const data = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                data.mensaje ||
                "No se pudieron cargar los estudiantes."
            );
        }

        const estudiantes = Array.isArray(data.estudiantes)
            ? data.estudiantes
            : [];

        const activos = estudiantes.filter(
            estudiante =>
                Number(estudiante.activo) === 1
        ).length;

        const totalElemento =
            document.getElementById("total-estudiantes");

        if (totalElemento) {
            totalElemento.textContent = activos;
        }

        console.log("Estudiantes dashboard:", estudiantes);
        console.log("Estudiantes activos:", activos);

    } catch (error) {
        console.error(
            "Error cargando estudiantes en dashboard:",
            error
        );

        const totalElemento =
            document.getElementById("total-estudiantes");

        if (totalElemento) {
            totalElemento.textContent = "0";
        }
    }
}

// =======================================
// MENÚ MÓVIL
// =======================================

function abrirMenu() {

    document.querySelector(
        ".sidebar-admin"
    ).classList.add("activo");

    document.getElementById(
        "sidebar-overlay"
    ).classList.add("activo");

}

function cerrarMenu() {

    document.querySelector(
        ".sidebar-admin"
    ).classList.remove("activo");

    document.getElementById(
        "sidebar-overlay"
    ).classList.remove("activo");

}


// =======================================
// CERRAR SESIÓN
// =======================================

async function cerrarSesion() {

    try {

        const respuesta = await fetch(
            `${API_URL}/api/auth/logout`,
            {
                method:"POST",
                credentials:"include"
            }
        );

        const data = await respuesta.json();

        if (respuesta.ok && data.ok) {

            window.location.href =
                "../../login.html";

            return;
        }

        mostrarToast(
            data.mensaje ||
            "No se pudo cerrar la sesión.",
            "danger"
        );

    } catch (error) {

        mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );

    }

}


// =======================================
// FUNCIONES AUXILIARES
// =======================================

function obtenerFechaLocal() {

    const fecha = new Date();

    const anio = fecha.getFullYear();

    const mes = String(
        fecha.getMonth() + 1
    ).padStart(2,"0");

    const dia = String(
        fecha.getDate()
    ).padStart(2,"0");

    return `${anio}-${mes}-${dia}`;

}

function obtenerSoloFecha(fecha) {

    if (!fecha) {
        return "";
    }

    return String(fecha).substring(0,10);

}

function construirFechaHora(fecha,hora) {

    return new Date(
        `${obtenerSoloFecha(fecha)}T${formatearHora(hora)}:00`
    );

}

function formatearHora(hora) {

    return hora
        ? String(hora).substring(0,5)
        : "--:--";

}

function formatearFecha(fecha) {

    const texto =
        obtenerSoloFecha(fecha);

    if (!texto) {
        return "Sin fecha";
    }

    const [anio,mes,dia] =
        texto.split("-");

    return `${dia}/${mes}/${anio}`;

}

function primerNombre(nombre="") {

    return nombre
        .trim()
        .split(/\s+/)[0] ||
        "Administrador";

}

function obtenerIniciales(nombre="") {

    return nombre
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0,2)
        .map(parte => parte[0])
        .join("")
        .toUpperCase() || "A";

}

function obtenerEmojiEspacio(reserva) {

    const emojis = {
        1:"⚽",
        2:"🏐",
        3:"🏀",
        4:"🎮"
    };

    return emojis[
        Number(reserva.id_espacio)
    ] || "📅";

}

function obtenerNombreEspacio(reserva) {

    const espacios = {
        1:"Cancha de fútbol",
        2:"Cancha de voleibol",
        3:"Cancha de baloncesto",
        4:"Zona Jaguar"
    };

    return espacios[
        Number(reserva.id_espacio)
    ] || "Reserva";

}

function claseEstado(estado) {

    const clases = {
        pendiente:"status-pending",
        aprobada:"status-approved",
        rechazada:"status-rejected",
        cancelada:"status-cancelled"
    };

    return clases[estado] || "status-pending";

}

function textoEstado(estado) {

    const textos = {
        pendiente:"Pendiente",
        aprobada:"Aprobada",
        rechazada:"Rechazada",
        cancelada:"Cancelada"
    };

    return textos[estado] || estado;

}

function escaparHTML(valor="") {

    return String(valor)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

}


// =======================================
// TOAST
// =======================================

function mostrarToast(
    mensaje,
    tipo="danger"
) {

    const toast =
        document.getElementById("toastMensaje");

    toast.querySelector(
        ".toast-body"
    ).textContent = mensaje;

    toast.className =
        `toast text-bg-${tipo}`;

    bootstrap.Toast
        .getOrCreateInstance(toast)
        .show();

}
