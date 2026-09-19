// ======================================
// PERFIL DEL ESTUDIANTE
// ======================================

// Guarda la imagen del QR que se muestra en el modal
let qrModalBlob = null;

// Guarda el código de la reserva para nombrar el archivo
let codigoQrModal = "";

// Guarda el código de la reserva
// que el estudiante desea cancelar.
let reservaSeleccionadaCancelar = null;


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
            `${API_URL}/api/auth/session`,
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

   const reservasOrdenadas = [...reservas];

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

async function cargarReservas(actualizarCards = false) {

    const contenedor =
        document.getElementById("lista-reservas");

    try {

        const estado =
            document.getElementById("filtro-estado")?.value || "";

        const fecha =
            document.getElementById("filtro-fecha")?.value || "";

        const parametros = new URLSearchParams();

        if (estado) {
            parametros.append("estado", estado);
        }

        if (fecha) {
            parametros.append("fecha", fecha);
        }

        const url =
            parametros.toString()
                ?   `${API_URL}/api/reservas?${parametros.toString()}`
                : ` ${API_URL}/api/reservas`;

        const respuesta = await fetch(url, {
            credentials: "include"
        });

        const data = await respuesta.json();

        if (!respuesta.ok || !data.ok) {

            contenedor.innerHTML = `
                <div class="reservas-empty">
                    <i class="bi bi-exclamation-circle"></i>
                    No se pudieron cargar tus reservas.
                </div>
            `;

            return;
        }

        reservasEstudiante = data.reservas || [];

        if (actualizarCards) {
            actualizarEstadisticas(reservasEstudiante);
        }

    renderizarReservas(reservasEstudiante);

    const lista =
         document.getElementById("lista-reservas");

    if (reservasEstudiante.length >= 4) {

    lista.classList.add("lista-scroll");

    } else {

    lista.classList.remove("lista-scroll");

}

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

async function verDetalleReserva(idReserva) {

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

    // ======================================
    // Acompañantes / Integrantes del equipo
    // o del club
    // ======================================

    const elAcompanantes =
        document.getElementById(
            "detalle-acompanantes"
        );

    const elEtiquetaAcompanantes =
        document.getElementById(
            "detalle-acompanantes-label"
        );

    const esEquipo =
        reserva.tipo_reserva === "equipo";

    const esClub =
        reserva.tipo_reserva === "club";

    if (elEtiquetaAcompanantes) {
        elEtiquetaAcompanantes.textContent =
            esEquipo
                ? "Integrantes del equipo"
                : esClub
                    ? "Integrantes del club"
                    : "Acompañantes autorizados";
    }

    // Valor temporal mientras se resuelve
    // (evita dejar pegado el número de otra reserva
    // si el modal se reutiliza).
    elAcompanantes.textContent = "…";

    if (esEquipo) {

        try {

            const respuesta = await fetch(
                `${API_URL}/api/reservas/${encodeURIComponent(idReserva)}/equipo-cantidad`,
                {
                    method: "GET",
                    credentials: "include"
                }
            );

            const datos = await respuesta.json();

            if (!respuesta.ok || !datos.ok) {
                throw new Error(
                    datos.mensaje ||
                    "No se pudo obtener la cantidad de integrantes."
                );
            }

            elAcompanantes.textContent =
                Number(datos.cantidad) || 0;

        } catch (error) {

            console.error(
                "Error obteniendo cantidad de integrantes:",
                error
            );

            elAcompanantes.textContent = "—";
        }

    } else if (esClub) {

        // =======================================
        // Mismo patrón que equipo, pero usando el
        // endpoint dedicado de club (club-cantidad),
        // ya que un club NO tiene id_equipo.
        // =======================================

        try {

            const respuesta = await fetch(
                `${API_URL}/api/reservas/${encodeURIComponent(idReserva)}/club-cantidad`,
                {
                    method: "GET",
                    credentials: "include"
                }
            );

            const datos = await respuesta.json();

            if (!respuesta.ok || !datos.ok) {
                throw new Error(
                    datos.mensaje ||
                    "No se pudo obtener la cantidad de integrantes del club."
                );
            }

            elAcompanantes.textContent =
                Number(datos.cantidad) || 0;

        } catch (error) {

            console.error(
                "Error obteniendo cantidad de integrantes del club:",
                error
            );

            elAcompanantes.textContent = "—";
        }

    } else {

        elAcompanantes.textContent =
            Number(
                reserva.cant_acompanantes
            ) || 0;
    }

    document
        .getElementById("detalle-solicitud")
        .textContent =
            reserva.solicitud_especial ||
            "Ninguna";


    // ======================================
    // Datos de cancelación
    // ======================================

    const grupoMotivo =
        document.getElementById(
            "grupo-motivo-cancelacion"
        );

    if (reserva.estado === "cancelada") {

        grupoMotivo.hidden = false;

        document
            .getElementById(
                "detalle-motivo-cancelacion"
            )
            .textContent =
                reserva.motivo_cancelacion ||
                "Sin motivo registrado";

    } else {

        grupoMotivo.hidden = true;

    }

    // ======================================
    // Datos de rechazo
    // ======================================
 
    const grupoMotivoRechazo =
        document.getElementById(
            "grupo-motivo-rechazo"
        );
 
    if (reserva.estado === "rechazada") {
 
        grupoMotivoRechazo.hidden = false;
 
        document
            .getElementById(
                "detalle-motivo-rechazo"
            )
            .textContent =
                reserva.motivo_rechazo ||
                "Sin motivo registrado";
 
    } else {
 
        grupoMotivoRechazo.hidden = true;
 
    }


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

codigoQrModal =
    reserva.id_reserva;

cargando.hidden = false;
imagen.hidden = true;
mensaje.hidden = true;

document
    .getElementById("qr-modal-info")
    .hidden = true;

document
    .getElementById("btn-descargar-qr-modal")
    .hidden = true;

const modal =
    new bootstrap.Modal(
        document.getElementById(
            "modalQrReserva"
        )
    );

modal.show();

try {

    const respuesta = await fetch(
           `${API_URL}/api/qr/${encodeURIComponent(idReserva)}/qr`,
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

    qrModalBlob =
        await respuesta.blob();

    const imagenURL =
        URL.createObjectURL(qrModalBlob);

    imagen.src = imagenURL;

    cargando.hidden = true;

    imagen.hidden = false;

    document
        .getElementById("qr-modal-info")
        .hidden = false;

    document
        .getElementById("btn-descargar-qr-modal")
        .hidden = false;

    } catch (error) {

    console.error(
        "Error cargando QR:",
        error
    );

    cargando.hidden = true;

    imagen.hidden = true;

    document
        .getElementById("qr-modal-info")
        .hidden = true;

    document
        .getElementById("btn-descargar-qr-modal")
        .hidden = true;

    mensaje.textContent =
        error.message;

    mensaje.hidden = false;
}
}

// ======================================
// Abrir modal para cancelar reserva
// ======================================
function cancelarReserva(idReserva) {

    const reserva =
        obtenerReserva(idReserva);

    if (!reserva) {
        return;
    }

    reservaSeleccionadaCancelar =
        idReserva;

    const textarea =
        document.getElementById(
            "motivo-cancelacion"
        );

    const contador =
        document.getElementById(
            "contador-motivo"
        );

    const mensaje =
        document.getElementById(
            "mensaje-cancelacion"
        );

    textarea.value = "";
    contador.textContent = "0";

    mensaje.textContent = "";
    mensaje.hidden = true;

    const modal =
        bootstrap.Modal.getOrCreateInstance(
            document.getElementById(
                "modalCancelarReserva"
            )
        );

    modal.show();

    setTimeout(() => {
        textarea.focus();
    }, 300);
}

// ======================================
// Enviar cancelación al servidor
// ======================================
async function enviarCancelacion() {

    const textarea =
        document.getElementById(
            "motivo-cancelacion"
        );

    const mensaje =
        document.getElementById(
            "mensaje-cancelacion"
        );

    const boton =
        document.getElementById(
            "btn-enviar-cancelacion"
        );

    const motivo =
        textarea.value.trim();

    if (!motivo) {

        mensaje.textContent =
            "Debes escribir el motivo de la cancelación.";

        mensaje.hidden = false;
        textarea.focus();

        return;
    }

    if (motivo.length < 5) {

        mensaje.textContent =
            "El motivo debe contener al menos 5 caracteres.";

        mensaje.hidden = false;
        textarea.focus();

        return;
    }

    if (!reservaSeleccionadaCancelar) {
        return;
    }

    try {

        boton.disabled = true;

        boton.innerHTML = `
            <span class="spinner-border spinner-border-sm"></span>
            Enviando...
        `;

        mensaje.hidden = true;

        const respuesta = await fetch(
               `${API_URL}/api/reservas/${encodeURIComponent(reservaSeleccionadaCancelar)}/cancelar`,
            {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    motivo_cancelacion: motivo
                })
            }
        );

        const data =
            await respuesta.json();

        if (!respuesta.ok || !data.ok) {

            throw new Error(
                data.mensaje ||
                "No se pudo cancelar la reserva."
            );
        }

        const modalElemento =
            document.getElementById(
                "modalCancelarReserva"
            );

        const modal =
            bootstrap.Modal.getInstance(
                modalElemento
            );

        modal?.hide();

        reservaSeleccionadaCancelar = null;

        await cargarReservas(false);

    } catch (error) {

        console.error(
            "Error cancelando reserva:",
            error
        );

        mensaje.textContent =
            error.message;

        mensaje.hidden = false;

    } finally {

        boton.disabled = false;

        boton.innerHTML = `
            <i class="bi bi-send"></i>
            Enviar cancelación
        `;
    }
}

// ======================================
// Contar caracteres del motivo
// ======================================
function actualizarContadorMotivo() {

    const textarea =
        document.getElementById(
            "motivo-cancelacion"
        );

    const contador =
        document.getElementById(
            "contador-motivo"
        );

    contador.textContent =
        textarea.value.length;
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
            `${API_URL}/api/auth/logout`,
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

function limpiarFiltros() {

    document.getElementById("filtro-estado").value = "";
    document.getElementById("filtro-fecha").value = "";

    cargarReservas(false);

}


// ======================================
// Inicialización
// ======================================
document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await cargarPerfil();
        await cargarReservas(true);

        document
            .getElementById("filtro-estado")
            ?.addEventListener(
                "change",
             () =>   cargarReservas (false)
            );

        document
            .getElementById("filtro-fecha")
            ?.addEventListener(
                "change",
                () =>   cargarReservas (false)
            );

        document
            .getElementById("btn-limpiar-filtros")
            ?.addEventListener(
                "click",
                limpiarFiltros
            );

        document
            .getElementById("motivo-cancelacion")
            ?.addEventListener(
             "input",
             actualizarContadorMotivo
            );

        document
             .getElementById("btn-enviar-cancelacion")
              ?.addEventListener(
              "click",
             enviarCancelacion
    );

    }
);

// =====================================
// Descargar código QR
// =====================================
function descargarQrModal() {

    if (!qrModalBlob) {
        return;
    }

    const url =
        URL.createObjectURL(qrModalBlob);

    const enlace =
        document.createElement("a");

    enlace.href = url;

    enlace.download =
        `QR-${codigoQrModal}.png`;

    document.body.appendChild(enlace);

    enlace.click();

    enlace.remove();

    URL.revokeObjectURL(url);
}

// =====================================
// Evento del botón Descargar QR
// =====================================
document
    .getElementById("btn-descargar-qr-modal")
    ?.addEventListener(
        "click",
        descargarQrModal
    );