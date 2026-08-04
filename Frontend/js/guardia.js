const API_URL = "http://localhost:3000";

let reservasDelDia = [];
let reservaSeleccionada = null;
let personaEncontrada = null;
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
// Busca por código, nombre, espacio
// o número de cuenta
// =======================================

function prepararBuscador() {

    const buscador =
        document.getElementById("buscador-reservas");

    const limpiar =
        document.getElementById("btn-limpiar-busqueda");

    const mensaje =
        document.getElementById("mensaje-sin-resultados");

    let temporizadorBusqueda;

    buscador.addEventListener("input", () => {

        clearTimeout(temporizadorBusqueda);

        temporizadorBusqueda = setTimeout(async () => {

            const valor = buscador.value.trim();
            const texto = normalizarTexto(valor);

            // Si el buscador está vacío, mostrar reservas del día
           if (!valor) {

                 // Ocultar la tarjeta de la persona encontrada
                    ocultarPersonaEncontrada();

                // Volver a mostrar resumen y listado general
                    cambiarVistaBusqueda(false);

                 // Mostrar nuevamente todas las reservas del día
                    renderizarReservas(reservasDelDia);

                mensaje.textContent =
                 "No hay reservas registradas para el día de hoy.";

    return;
}

            // Verificar si escribió únicamente números
            const esNumeroCuenta = /^\d+$/.test(valor);

            // Si son números, buscar la cuenta en el backend
            if (esNumeroCuenta) {

                await buscarReservaPorCuenta(valor);

                return;
            }

            // Si escribió texto, ocultar la tarjeta individual
             ocultarPersonaEncontrada();

            // Si escribió texto, conservar la búsqueda actual
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

            mensaje.textContent =
                "No hay reservas que coincidan con la búsqueda.";

        }, 400);

    });

    limpiar.addEventListener("click", () => {

        clearTimeout(temporizadorBusqueda);

        buscador.value = "";

        ocultarPersonaEncontrada();

        renderizarReservas(reservasDelDia);

        mensaje.textContent =
            "No hay reservas registradas para el día de hoy.";

        buscador.focus();

    });

}



// =======================================
// BUSCAR PERSONA POR NÚMERO DE CUENTA
// =======================================

async function buscarReservaPorCuenta(cuenta) {

    const mensaje =
        document.getElementById("mensaje-sin-resultados");

    try {

        const respuesta = await fetch(
            `${API_URL}/api/guardias/buscar?cuenta=${encodeURIComponent(cuenta)}`,
            {
                credentials: "include"
            }
        );

        const data = await respuesta.json();

        // No se encontró una persona autorizada
        if (respuesta.status === 404) {

            personaEncontrada = null;
            ocultarPersonaEncontrada();
            renderizarReservas([]);

            mensaje.textContent =
                data.mensaje ||
                "No se encontró una persona con ese número de cuenta.";

            return;
        }

        // La sesión ya no está activa
        if (respuesta.status === 401) {

            window.location.href =
                "../../login.html";

            return;
        }

        // Otros errores
        if (!respuesta.ok || !data.ok) {

            personaEncontrada = null;
            ocultarPersonaEncontrada();
            renderizarReservas([]);

            mostrarToast(
                data.mensaje ||
                "No se pudo realizar la búsqueda.",
                "danger"
            );

            return;
        }

        const resultados =
            Array.isArray(data.reservas)
                ? data.reservas
                : [];

        if (!resultados.length) {

            personaEncontrada = null;
            ocultarPersonaEncontrada();
            renderizarReservas([]);

            mensaje.textContent =
                "No se encontró una persona con ese número de cuenta.";

            return;
        }

     // Mostrar todas las reservas relacionadas con la cuenta
        mostrarPersonasEncontradas(resultados); 

        // También mostramos la reserva relacionada
        renderizarReservas(resultados);

    } catch (error) {

        console.error(
            "Error buscando por número de cuenta:",
            error
        );

        personaEncontrada = null;
        ocultarPersonaEncontrada();
        renderizarReservas([]);

        mostrarToast(
            "No se pudo conectar con el servidor.",
            "danger"
        );
    }
}

// =======================================
// MOSTRAR TODAS LAS RESERVAS ENCONTRADAS
// =======================================

function mostrarPersonasEncontradas(resultados) {

    const contenedor =
        document.getElementById("resultado-persona");

    if (!contenedor) {
        console.error(
            "No existe #resultado-persona en el HTML."
        );
        return;
    }

    // Limpiar la tarjeta anterior
    contenedor.innerHTML = "";

    resultados.forEach(persona => {

        const estadoHorario =
            calcularEstadoHorario(persona);

        const asistio =
            Number(persona.asistio) === 1;

        const puedeMarcar =
            estadoHorario.codigo === "activo" &&
            !asistio;

        const tarjeta =
            document.createElement("article");

        tarjeta.className =
            "resultado-persona-item";

        tarjeta.innerHTML = `
            <div class="resultado-persona-avatar">
                ${escaparHTML(
                    obtenerIniciales(persona.nombre)
                )}
            </div>

            <div class="resultado-persona-info">

                <div class="resultado-persona-superior">
                    <div>
                        <span class="resultado-etiqueta">
                            ${
                                persona.tipo_asistencia === "titular"
                                    ? "Titular"
                                    : "Acompañante"
                            }
                        </span>

                        <h3>
                            ${escaparHTML(persona.nombre)}
                        </h3>
                    </div>

                    <span class="resultado-estado ${
                        asistio
                            ? "registrado"
                            : estadoHorario.clase
                    }">
                        ${
                            asistio
                                ? "Registrado"
                                : estadoHorario.texto
                        }
                    </span>
                </div>

                <p>
                    <i class="bi bi-person-vcard"></i>
                    Cuenta:
                    <strong>
                        ${escaparHTML(persona.cuenta)}
                    </strong>
                </p>

                <p>
                    <i class="bi bi-ticket-perforated"></i>
                    Reserva:
                    <strong>
                        ${escaparHTML(persona.id_reserva)}
                    </strong>
                </p>

                <p>
                    <i class="bi bi-geo-alt"></i>
                    ${escaparHTML(persona.espacio || "Espacio")}
                    <span class="resultado-separador">·</span>
                    ${formatearHora(persona.hora_inicio)}
                    -
                    ${formatearHora(persona.hora_fin)}
                </p>
            </div>

            <div class="resultado-persona-acciones">

                <button
                    type="button"
                    class="btn-ver-reserva"
                >
                    <i class="bi bi-eye"></i>
                    Ver reserva
                </button>

                <button
                    type="button"
                    class="btn-marcar-persona"
                    ${puedeMarcar ? "" : "disabled"}
                >
                    <i class="bi ${
                        asistio
                            ? "bi-check-circle-fill"
                            : estadoHorario.codigo === "activo"
                                ? "bi-check2-circle"
                                : "bi-clock"
                    }"></i>

                    ${
                        asistio
                            ? "Registrado"
                            : estadoHorario.texto
                    }
                </button>
            </div>
        `;

        const botonVer =
            tarjeta.querySelector(
                ".btn-ver-reserva"
            );

        const botonMarcar =
            tarjeta.querySelector(
                ".btn-marcar-persona"
            );

        // Abrir esta reserva específica
        botonVer.addEventListener(
            "click",
            () => {
                abrirDetalleReserva(
                    persona.id_reserva
                );
            }
        );

        // Marcar en esta reserva específica
        if (puedeMarcar) {

            botonMarcar.addEventListener(
                "click",
                () => {
                    marcarAsistenciaEncontrada(
                        persona,
                        botonMarcar
                    );
                }
            );
        }

        contenedor.appendChild(tarjeta);
    });

    cambiarVistaBusqueda(true);

    contenedor.hidden = false;
}



// =======================================
// MOSTRAR PERSONA ENCONTRADA
// =======================================

function mostrarPersonaEncontrada(persona) {

    const contenedor =
        document.getElementById("resultado-persona");

    if (!contenedor) {
        console.error(
            "No existe #resultado-persona en el HTML."
        );
        return;
    }

    const estadoHorario =
        calcularEstadoHorario(persona);

    const asistio =
        Number(persona.asistio) === 1;

    document.getElementById(
        "resultado-persona-avatar"
    ).textContent =
        obtenerIniciales(persona.nombre);

    document.getElementById(
        "resultado-tipo"
    ).textContent =
        persona.tipo_asistencia === "titular"
            ? "Titular"
            : "Acompañante";

    document.getElementById(
        "resultado-nombre"
    ).textContent =
        persona.nombre || "Estudiante";

    document.getElementById(
        "resultado-cuenta"
    ).textContent =
        persona.cuenta || "—";

    document.getElementById(
        "resultado-reserva"
    ).textContent =
        persona.id_reserva || "—";

    document.getElementById(
        "resultado-espacio"
    ).textContent =
        persona.espacio || "Espacio";

    document.getElementById(
        "resultado-horario"
    ).textContent =
        `${formatearHora(persona.hora_inicio)} - ${formatearHora(persona.hora_fin)}`;

    const estadoElemento =
        document.getElementById("resultado-estado");

    estadoElemento.textContent =
        asistio
            ? "Registrado"
            : estadoHorario.texto;

    estadoElemento.className =
        asistio
            ? "resultado-estado registrado"
            : `resultado-estado ${estadoHorario.clase}`;

    configurarBotonesPersona(
        persona,
        estadoHorario,
        asistio
    );
   
   cambiarVistaBusqueda(true);

    contenedor.hidden = false;

}

// =======================================
// CONFIGURAR BOTONES DEL RESULTADO
// =======================================

function configurarBotonesPersona(
    persona,
    estadoHorario,
    asistio
) {

    const botonVer =
        document.getElementById(
            "btn-ver-reserva-encontrada"
        );

    const botonMarcar =
        document.getElementById(
            "btn-marcar-persona"
        );

    // Abrir el detalle completo de la reserva
    botonVer.onclick = () => {
        abrirDetalleReserva(
            persona.id_reserva
        );
    };

    // Si ya se registró, deshabilitar el botón
    if (asistio) {

        botonMarcar.disabled = true;

        botonMarcar.innerHTML = `
            <i class="bi bi-check-circle-fill"></i>
            Registrado
        `;

        return;
    }

    // Solo se registra dentro del horario activo
    if (estadoHorario.codigo !== "activo") {

        botonMarcar.disabled = true;

        botonMarcar.innerHTML = `
            <i class="bi bi-clock"></i>
            ${estadoHorario.texto}
        `;

        return;
    }

    botonMarcar.disabled = false;

    botonMarcar.innerHTML = `
        <i class="bi bi-check2-circle"></i>
        Marcar asistencia
    `;

    botonMarcar.onclick = () => {
        marcarAsistenciaEncontrada();
    };
}
// =======================================
// MARCAR ASISTENCIA DESDE LA BÚSQUEDA
// =======================================

async function marcarAsistenciaEncontrada(
    persona,
    boton
) {

    if (!persona || !boton) {

        mostrarToast(
            "No se pudo identificar la persona.",
            "warning"
        );

        return;
    }

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
            `${API_URL}/api/guardias/${encodeURIComponent(persona.id_reserva)}/asistencia`,
            {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    personas: [
                        {
                            id_estudiante:
                                Number(persona.id_estudiante),

                            tipo_asistencia:
                                persona.tipo_asistencia
                        }
                    ]
                })
            }
        );

        const data = await respuesta.json();

        if (!respuesta.ok || !data.ok) {

            mostrarToast(
                data.mensaje ||
                "No se pudo registrar la asistencia.",
                "danger"
            );

            const cuenta =
                document
                    .getElementById("buscador-reservas")
                    .value
                    .trim();

            await buscarReservaPorCuenta(cuenta);

            return;
        }

        mostrarToast(
            data.mensaje ||
            "Asistencia registrada correctamente.",
            "success"
        );

        // Volver a consultar todas las reservas
        const cuenta =
            document
                .getElementById("buscador-reservas")
                .value
                .trim();

        await buscarReservaPorCuenta(cuenta);
        await cargarReservasHoy();

    } catch (error) {

        console.error(
            "Error marcando asistencia:",
            error
        );

        mostrarToast(
            "No se pudo registrar la asistencia.",
            "danger"
        );

        boton.disabled = false;

        boton.innerHTML = `
            <i class="bi bi-check2-circle"></i>
            Marcar asistencia
        `;
    }
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
// Oculta y limpia el resultado de la búsqueda
function ocultarPersonaEncontrada() {

    const contenedor =
        document.getElementById(
            "resultado-persona"
        );

    if (contenedor) {
        contenedor.hidden = true;
    }

    personaEncontrada = null;

    cambiarVistaBusqueda(false);
}

// =======================================
// MOSTRAR U OCULTAR CONTENIDO GENERAL
// =======================================

function cambiarVistaBusqueda(mostrandoPersona) {

    const resumen =
        document.querySelector(".resumen-dia");

    const lista =
        document.getElementById("lista-reservas");

    const sinResultados =
        document.getElementById("sin-resultados");

    // Cuando aparece una persona exacta,
    // ocultamos el resumen y las reservas.
    if (resumen) {
        resumen.hidden = mostrandoPersona;
    }

    if (lista) {
        lista.hidden = mostrandoPersona;
    }

    // Evita mostrar el mensaje vacío
    // mientras existe una persona encontrada.
    if (sinResultados && mostrandoPersona) {
        sinResultados.hidden = true;
    }
}

const botonSeleccionarTodos =
    document.getElementById("btn-seleccionar-todos");

botonSeleccionarTodos.addEventListener("click", () => {

    const checkboxes = [
        ...document.querySelectorAll(
            ".checkbox-asistencia:not(:disabled)"
        )
    ];

    if (!checkboxes.length) {
        return;
    }

    // Verifica si todos ya están seleccionados
    const todosSeleccionados =
        checkboxes.every(check => check.checked);

    // Si todos están seleccionados, los desmarca.
    // Si no, los selecciona todos.
    checkboxes.forEach(check => {
        check.checked = !todosSeleccionados;
    });

    actualizarContadorSeleccionados();

    // Cambiar el texto del botón
    botonSeleccionarTodos.innerHTML =
        todosSeleccionados
            ? `
                <i class="bi bi-check2-square"></i>
                Seleccionar todos
              `
            : `
                <i class="bi bi-x-square"></i>
                Deseleccionar todos
              `;
});



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