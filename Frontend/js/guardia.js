const API_URL = "http://localhost:3000";

let reservasDelDia = [];
let reservaSeleccionada = null;
let modalReserva = null;


// =======================================
// INICIAR PANEL
// =======================================

document.addEventListener("DOMContentLoaded", async () => {
   modalReserva = new bootstrap.Modal(
        document.getElementById("modalReserva")
    );
   mostrarFechaActual();
    prepararBuscador();
   await cargarSesionGuardia();
    await cargarReservasHoy();

});


// =======================================
// CARGAR SESIÓN DEL GUARDIA
// =======================================

async function cargarSesionGuardia() {
   try {
       const respuesta = await fetch(
            `${API_URL}/api/auth/session`,
            {
                credentials: "include"
            }
        );
       const data = await respuesta.json();
       if (!respuesta.ok || !data.ok) {
           window.location.href =

          "../../login.html";
           return;
        }
       if (data.usuario.rol !== "guardia") {
           window.location.href =

         "../../login.html";
           return;
        }
       const nombre = data.usuario.nombre || "Guardia";
       document.getElementById("guardia-nombre").textContent =
            nombre;
       document.getElementById("guardia-avatar").textContent =
            obtenerIniciales(nombre);
   } catch (error) {
       console.error("Error cargando sesión:", error);
       mostrarToast(
            "No se pudo verificar la sesión.",
            "danger"
        );
   }

}


// =======================================
// MOSTRAR FECHA ACTUAL
// =======================================

function mostrarFechaActual() {
   const fecha = new Date();
   const texto = fecha.toLocaleDateString("es-HN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
   const textoFormateado =
        texto.charAt(0).toUpperCase() + texto.slice(1);
   const contenedor =
        document.querySelector("#fecha-actual span");
   if (contenedor) {
        contenedor.textContent = textoFormateado;
    }

}


// =======================================
// OBTENER RESERVAS DE HOY
// =======================================

async function cargarReservasHoy() {
   mostrarCarga(true);
   try {
       const respuesta = await fetch(
            `${API_URL}/api/guardias/hoy`,
            {
                credentials: "include"
            }
        );
       const data = await respuesta.json();
       if (respuesta.status === 401) {
           window.location.href =
           "../../login.html";
           return;
        }
       if (!respuesta.ok || !data.ok) {
           mostrarToast(
                data.mensaje ||
                "No se pudieron cargar las reservas.",
                "danger"
            );
           reservasDelDia = [];
            renderizarReservas([]);
           return;
        }
       reservasDelDia = Array.isArray(data.reservas)
            ? data.reservas
            : [];
       actualizarResumen(reservasDelDia);
        renderizarReservas(reservasDelDia);
   } catch (error) {
       console.error("Error cargando reservas:", error);
       mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );
       reservasDelDia = [];
        renderizarReservas([]);
   } finally {
       mostrarCarga(false);
   }

}


// =======================================
// RENDERIZAR TARJETAS
// =======================================

function renderizarReservas(reservas) {
   const lista = document.getElementById("lista-reservas");
    const sinResultados =
        document.getElementById("sin-resultados");
   lista.innerHTML = "";
   if (!reservas.length) {
       sinResultados.hidden = false;
        return;
   }
   sinResultados.hidden = true;
   reservas.forEach(reserva => {
       const estadoHorario = calcularEstadoHorario(reserva);
       const tarjeta = document.createElement("article");
       tarjeta.className = "card-reserva";
        tarjeta.tabIndex = 0;
       tarjeta.innerHTML = `
            <div class="card-header">
                <span class="codigo">
                    ${escaparHTML(reserva.id_reserva)}
                </span>
               <span class="estado ${estadoHorario.clase}">
                    ${estadoHorario.texto}
                </span>
            </div>
           <div class="card-body">
               <h4>
                    ${escaparHTML(reserva.estudiante || "Estudiante")}
                </h4>
               <p>
                    <i class="bi bi-geo-alt"></i>
                    ${escaparHTML(reserva.espacio || "Espacio")}
                </p>
               <p>
                    <i class="bi bi-clock"></i>
                    ${formatearHora(reserva.hora_inicio)}
                    –
                    ${formatearHora(reserva.hora_fin)}
                </p>
               <p>
                    <i class="bi bi-people"></i>
                    ${Number(reserva.cant_acompanantes || 0) + 1}
                    persona(s) autorizada(s)
                </p>
           </div>
        `;
       tarjeta.addEventListener("click", () => {
            abrirDetalleReserva(reserva.id_reserva);
        });
       tarjeta.addEventListener("keydown", event => {
           if (event.key === "Enter" || event.key === " ") {
               event.preventDefault();
                abrirDetalleReserva(reserva.id_reserva);
           }
       });
       lista.appendChild(tarjeta);
   });

}


// =======================================
// BUSCADOR
// =======================================

function prepararBuscador() {
   const buscador =
        document.getElementById("buscador-reservas");
   const limpiar =
        document.getElementById("btn-limpiar-busqueda");
   buscador.addEventListener("input", () => {
       const texto =
            normalizarTexto(buscador.value.trim());
       const filtradas = reservasDelDia.filter(reserva => {
           const codigo =
                normalizarTexto(reserva.id_reserva);
           const nombre =
                normalizarTexto(reserva.estudiante);
           const espacio =
                normalizarTexto(reserva.espacio);
           return (
                codigo.includes(texto) ||
                nombre.includes(texto) ||
                espacio.includes(texto)
            );
       });
       renderizarReservas(filtradas);
       const mensaje =
            document.getElementById("mensaje-sin-resultados");
       if (texto) {
           mensaje.textContent =
                "No hay reservas que coincidan con la búsqueda.";
       } else {
           mensaje.textContent =
                "No hay reservas registradas para el día de hoy.";
       }
   });
   limpiar.addEventListener("click", () => {
       buscador.value = "";
        renderizarReservas(reservasDelDia);
        buscador.focus();
   });

}


// =======================================
// ABRIR DETALLE
// =======================================

async function abrirDetalleReserva(idReserva) {
   limpiarModal();
   modalReserva.show();
   try {
       const respuesta = await fetch(
            `${API_URL}/api/guardias/${encodeURIComponent(idReserva)}`,
            {
                credentials: "include"
            }
        );
       const data = await respuesta.json();
       if (!respuesta.ok || !data.ok) {
           mostrarToast(
                data.mensaje ||
                "No se pudo cargar la reserva.",
                "danger"
            );
           modalReserva.hide();
            return;
       }
       reservaSeleccionada = data;
       mostrarDetalleReserva(
            data.reserva,
            data.personas || [],
            data.puede_registrar
        );
   } catch (error) {
       console.error("Error cargando detalle:", error);
       mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );
       modalReserva.hide();
   }

}


// =======================================
// MOSTRAR DETALLE EN MODAL
// =======================================

function mostrarDetalleReserva(
    reserva,
    personas,
    puedeRegistrar
) {
   document.getElementById("modal-codigo").textContent =
        reserva.id_reserva;
   document.getElementById("modalReservaTitulo").textContent =
        reserva.juego
            ? reserva.juego
            : reserva.espacio;
   document.getElementById("modal-espacio").textContent =
        reserva.juego
            ? `${reserva.espacio} · ${reserva.juego}`
            : reserva.espacio;
   document.getElementById("modal-horario").textContent =
        `${formatearHora(reserva.hora_inicio)} – ${formatearHora(reserva.hora_fin)}`;
   document.getElementById(
        "modal-personas-esperadas"
    ).textContent =
        `${personas.length} persona(s) registrada(s)`;
   const estado = calcularEstadoHorario(reserva);
   document.getElementById(
        "texto-estado-horario"
    ).textContent = estado.descripcion;
   const estadoHorario =
        document.getElementById("estado-horario");
   estadoHorario.className =
        `estado-horario ${estado.clase}`;
   renderizarPersonas(personas, puedeRegistrar);
   configurarDisponibilidadAsistencia(
        puedeRegistrar,
        estado
    );
   actualizarContadorSeleccionados();

}


// =======================================
// RENDERIZAR PERSONAS
// =======================================

function renderizarPersonas(personas, puedeRegistrar) {
   const lista =
        document.getElementById("lista-personas");
   lista.innerHTML = "";
   if (!personas.length) {
       lista.innerHTML = `
            <div class="sin-personas">
                <i class="bi bi-person-x"></i>
                <p>No hay personas registradas en esta reserva.</p>
            </div>
        `;
       return;
   }
   personas.forEach(persona => {
       const asistio =
            Number(persona.asistio) === 1;
       const iniciales =
            obtenerIniciales(persona.nombre);
       const item = document.createElement("label");
       item.className =
            `persona ${asistio ? "persona-registrada" : ""}`;
       item.innerHTML = `
            <div class="persona-contenido">
               <div class="persona-avatar">
                    ${escaparHTML(iniciales)}
                </div>
               <div class="persona-info">
                   <h5>
                        ${escaparHTML(persona.nombre)}
                    </h5>
                   <small>
                        ${escaparHTML(persona.cuenta)}
                    </small>
                   <span class="persona-rol">
                        ${
                            persona.tipo_asistencia === "titular"
                                ? "Titular"
                                : "Acompañante"
                        }
                    </span>
                   ${
                        asistio && persona.hora_entrada
                            ? `
                                <span class="hora-entrada">
                                    Entrada:
                                    ${formatearHora(persona.hora_entrada)}
                                </span>
                              `
                            : ""
                    }
               </div>
           </div>
           <div class="persona-control">
               ${
                    asistio
                        ? `
                            <span class="asistencia-confirmada">
                                <i class="bi bi-check-circle-fill"></i>
                                Registrada
                            </span>
                          `
                        : `
                            <input
                                type="checkbox"
                                class="checkbox-asistencia"
                                value="${Number(persona.id_estudiante)}"
                                data-tipo="${escaparHTML(persona.tipo_asistencia)}"
                                ${puedeRegistrar ? "" : "disabled"}
                            >
                          `
                }
           </div>
        `;
       const checkbox =
            item.querySelector(".checkbox-asistencia");
       if (checkbox) {
           checkbox.addEventListener(
                "change",
                actualizarContadorSeleccionados
            );
       }
       lista.appendChild(item);
   });

}


// =======================================
// GUARDAR ASISTENCIA
// =======================================

async function guardarAsistencia() {
   if (!reservaSeleccionada) {
        return;
    }
   const seleccionados = [
        ...document.querySelectorAll(
            ".checkbox-asistencia:checked"
        )
    ];
   if (!seleccionados.length) {
       mostrarToast(
            "Selecciona al menos una persona.",
            "warning"
        );
       return;
   }
   const personas = seleccionados.map(checkbox => ({
       id_estudiante: Number(checkbox.value),
       tipo_asistencia:
            checkbox.dataset.tipo
   }));
   const idReserva =
        reservaSeleccionada.reserva.id_reserva;
   const boton =
        document.getElementById("btn-guardar-asistencia");
   boton.disabled = true;
   boton.innerHTML = `
        <span
            class="spinner-border spinner-border-sm"
            aria-hidden="true"
        ></span>
        Guardando...
    `;
   try {
       const respuesta = await fetch(
            `${API_URL}/api/guardias/${encodeURIComponent(idReserva)}/asistencia`,
            {
                method: "PUT",
               credentials: "include",
               headers: {
                    "Content-Type": "application/json"
                },
               body: JSON.stringify({
                    personas
                })
            }
        );
       const data = await respuesta.json();
       if (!respuesta.ok || !data.ok) {
           mostrarToast(
                data.mensaje ||
                "No se pudo guardar la asistencia.",
                "danger"
            );
           return;
       }
       mostrarToast(
            data.mensaje ||
            "Asistencia guardada correctamente.",
            "success"
        );
       await abrirDetalleReserva(idReserva);
        await cargarReservasHoy();
   } catch (error) {
       console.error("Error guardando asistencia:", error);
       mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );
   } finally {
       boton.disabled = false;
       boton.innerHTML = `
            <i class="bi bi-check2-circle"></i>
            Guardar asistencia
        `;
   }

}


// =======================================
// HABILITAR O BLOQUEAR ASISTENCIA
// =======================================

function configurarDisponibilidadAsistencia(
    puedeRegistrar,
    estado
) {
   const boton =
        document.getElementById("btn-guardar-asistencia");
   const alerta =
        document.getElementById("alerta-reserva");
   const texto =
        document.getElementById("alerta-reserva-texto");
   boton.disabled = !puedeRegistrar;
    alerta.hidden = Boolean(puedeRegistrar);
   if (!puedeRegistrar) {
       texto.textContent =
            estado.descripcion ||
            "Esta reserva ya no permite registrar asistencia.";
   }

}


// =======================================
// RESUMEN DEL DÍA
// =======================================

function actualizarResumen(reservas) {
   let pendientes = 0;
    let vigentes = 0;
   reservas.forEach(reserva => {
       const estado = calcularEstadoHorario(reserva);
       if (estado.codigo === "pendiente") {
            pendientes++;
        }
       if (estado.codigo === "activo") {
            vigentes++;
        }
   });
   document.getElementById("total-reservas").textContent =
        reservas.length;
   document.getElementById("total-pendientes").textContent =
        pendientes;
   document.getElementById("total-vigentes").textContent =
        vigentes;

}


// =======================================
// CALCULAR ESTADO DEL HORARIO
// =======================================

function calcularEstadoHorario(reserva) {
   if (reserva.estado === "cancelada") {
       return {
            codigo: "cancelada",
            texto: "Cancelada",
            clase: "estado-cancelada",
            descripcion:
                "La reserva fue cancelada y no permite registrar asistencia."
        };
   }
   if (reserva.estado === "rechazada") {
       return {
            codigo: "rechazada",
            texto: "Rechazada",
            clase: "estado-cancelada",
            descripcion:
                "La reserva fue rechazada y no permite registrar asistencia."
        };
   }
   const ahora = new Date();
   const inicio =
        construirFechaHora(reserva.fecha, reserva.hora_inicio);
   const fin =
        construirFechaHora(reserva.fecha, reserva.hora_fin);
   if (ahora < inicio) {
       const minutos =
            Math.max(1, Math.ceil((inicio - ahora) / 60000));
       return {
            codigo: "pendiente",
            texto: "Pendiente",
            clase: "estado-pendiente",
            descripcion:
                `La reserva comienza en ${minutos} minuto(s).`
        };
   }
   if (ahora > fin) {
       return {
            codigo: "vencida",
            texto: "Vencida",
            clase: "estado-vencida",
            descripcion:
                "El horario de esta reserva ya venció."
        };
   }
   const minutosRestantes =
        Math.max(0, Math.ceil((fin - ahora) / 60000));
   return {
        codigo: "activo",
        texto: "Horario activo",
        clase: "estado-activo",
        descripcion:
            `Horario activo · Vence en ${minutosRestantes} minuto(s).`
    };

}


// =======================================
// CERRAR SESIÓN
// =======================================

async function cerrarSesion() {
   try {
       const respuesta = await fetch(
            `${API_URL}/api/auth/logout`,
            {
                method: "POST",
                credentials: "include"
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
       console.error("Error cerrando sesión:", error);
       mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );
   }

}


// =======================================
// FUNCIONES AUXILIARES
// =======================================

function mostrarCarga(mostrar) {
   document.getElementById(
        "estado-carga"
    ).style.display = mostrar ? "flex" : "none";

}


function limpiarModal() {
   reservaSeleccionada = null;
   document.getElementById("modal-codigo").textContent =
        "Cargando...";
   document.getElementById("modalReservaTitulo").textContent =
        "Reserva";
   document.getElementById("modal-espacio").textContent =
        "Cargando información...";
   document.getElementById("modal-horario").textContent =
        "--:-- – --:--";
   document.getElementById(
        "modal-personas-esperadas"
    ).textContent = "";
   document.getElementById("lista-personas").innerHTML = `
        <div class="estado-carga">
            <div
                class="spinner-border text-danger"
                role="status"
            ></div>
           <p>Cargando personas...</p>
        </div>
    `;
   document.getElementById(
        "btn-guardar-asistencia"
    ).disabled = true;
   document.getElementById(
        "alerta-reserva"
    ).hidden = true;

}


function actualizarContadorSeleccionados() {
   const cantidad = document.querySelectorAll(
        ".checkbox-asistencia:checked"
    ).length;
   document.getElementById(
        "contador-seleccionados"
    ).textContent =
        `${cantidad} seleccionada(s)`;

}


function obtenerIniciales(nombre = "") {
   return nombre
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte.charAt(0))
        .join("")
        .toUpperCase() || "G";

}


function formatearHora(hora) {
   if (!hora) {
        return "--:--";
    }
   return String(hora).substring(0, 5);

}


function construirFechaHora(fecha, hora) {
   const fechaTexto =
        fecha instanceof Date
            ? fecha.toISOString().slice(0, 10)
            : String(fecha).slice(0, 10);
   return new Date(
        `${fechaTexto}T${formatearHora(hora)}:00`
    );

}


function normalizarTexto(texto = "") {
   return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

}


function escaparHTML(valor = "") {
   return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// =======================================
// TOAST
// =======================================

function mostrarToast(mensaje, tipo = "danger") {
   const toast =
        document.getElementById("toastMensaje");
   const cuerpo =
        toast.querySelector(".toast-body");
   cuerpo.textContent = mensaje;
   toast.className = `toast text-bg-${tipo}`;
   const instancia =
        bootstrap.Toast.getOrCreateInstance(toast);
   instancia.show();

}