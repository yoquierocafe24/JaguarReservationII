// ======================================
// ELEMENTOS DEL HTML
// ======================================

const parametros =
    new URLSearchParams(window.location.search);

const token =
    parametros.get("token");

const mensajeReserva =
    document.getElementById("mensaje-reserva");

const datosReserva =
    document.getElementById("datos-reserva");

const formulario =
    document.getElementById("form-unirse");

const resultado =
    document.getElementById("resultado");

const botonRegistrar =
    document.getElementById("btn-registrar");


// ======================================
// VALIDAR TOKEN AL ABRIR LA PÁGINA
// ======================================

if (!token) {

    mostrarErrorReserva(
        "El enlace de la reserva no es válido."
    );

} else {

    cargarReserva();
}


// ======================================
// CONSULTAR DATOS DE LA RESERVA
// ======================================

async function cargarReserva() {

    try {

        mensajeReserva.className =
            "estado-reserva";

        mensajeReserva.textContent =
            "Verificando la reserva...";

        const respuesta = await fetch(
            `http://localhost:3000/api/qr/publica/${encodeURIComponent(token)}`
        );

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos.ok) {
            throw new Error(
                datos.mensaje ||
                "No se pudo consultar la reserva."
            );
        }

        const reserva = datos.reserva;

        document
            .getElementById("reserva-codigo")
            .textContent =
                reserva.id_reserva || "--";

        document
            .getElementById("reserva-espacio")
            .textContent =
                reserva.espacio || "--";

        document
            .getElementById("reserva-fecha")
            .textContent =
                formatearFecha(reserva.fecha);

        document
            .getElementById("reserva-horario")
            .textContent =
                `${formatearHora(reserva.hora_inicio)} - ${formatearHora(reserva.hora_fin)}`;

        mensajeReserva.className =
            "estado-reserva exito";

        mensajeReserva.textContent =
            "Reserva disponible para registro.";

        datosReserva.hidden = false;
        formulario.hidden = false;

    } catch (error) {

        console.error(
            "Error consultando la reserva:",
            error
        );

        mostrarErrorReserva(error.message);
    }
}


// ======================================
// REGISTRAR ACOMPAÑANTE
// ======================================

formulario.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const nombre =
            document
                .getElementById("nombre")
                .value
                .trim();

        // Solo permitir letras y espacios
const expresionNombre =
    /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;

if (!expresionNombre.test(nombre)) {

    mostrarResultado(
        "El nombre solo puede contener letras y espacios.",
        "error"
    );

    return;
} 


        const cuenta =
            document
                .getElementById("cuenta")
                .value
                .trim();

        if (!nombre || !cuenta) {

            mostrarResultado(
                "Debes ingresar tu nombre completo y número de cuenta.",
                "error"
            );

            return;
        }

        try {

            botonRegistrar.disabled = true;

            botonRegistrar.innerHTML = `
                <span
                    class="spinner-border spinner-border-sm me-2"
                    aria-hidden="true"
                ></span>
                Verificando...
            `;

            const respuesta = await fetch(
                "http://localhost:3000/api/qr/unirse",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        token,
                        nombre,
                        cuenta
                    })
                }
            );

            const datos = await respuesta.json();

            if (!respuesta.ok || !datos.ok) {
                throw new Error(
                    datos.mensaje ||
                    "No fue posible registrarte."
                );
            }

            mostrarResultado(
                datos.mensaje ||
                "Te registraste correctamente en la reserva.",
                "exito"
            );

            formulario.reset();
            formulario.hidden = true;

        } catch (error) {

            console.error(
                "Error registrando acompañante:",
                error
            );

            mostrarResultado(
                error.message,
                "error"
            );

        } finally {

            botonRegistrar.disabled = false;

            botonRegistrar.innerHTML = `
                <i class="bi bi-check-circle-fill"></i>
                Registrarme en la reserva
            `;
        }
    }
);


// ======================================
// MOSTRAR ERROR DE RESERVA
// ======================================

function mostrarErrorReserva(mensaje) {

    mensajeReserva.className =
        "estado-reserva error";

    mensajeReserva.textContent =
        mensaje;

    datosReserva.hidden = true;
    formulario.hidden = true;
}


// ======================================
// MOSTRAR RESULTADO DEL REGISTRO
// ======================================

function mostrarResultado(mensaje, tipo) {

    resultado.hidden = false;

    resultado.className =
        `resultado-registro ${tipo}`;

    resultado.textContent =
        mensaje;
}


// ======================================
// FORMATEAR FECHA
// ======================================

function formatearFecha(fecha) {

    if (!fecha) {
        return "--";
    }

    const fechaNormalizada =
        String(fecha).split("T")[0];

    const partes =
        fechaNormalizada.split("-");

    if (partes.length !== 3) {
        return fecha;
    }

    const [anio, mes, dia] = partes;

    return `${dia}/${mes}/${anio}`;
}


// ======================================
// FORMATEAR HORA
// ======================================

function formatearHora(hora) {

    if (!hora) {
        return "--";
    }

    return String(hora)
        .substring(0, 5);
}