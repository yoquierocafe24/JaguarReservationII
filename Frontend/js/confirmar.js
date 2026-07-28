// Datos guardados desde reservar.js
const reserva = JSON.parse(
    sessionStorage.getItem("ultimaReserva")
);


/* const debeMostrarQR =
    reserva.tiene_qr === true ||
    Boolean(reserva.qr_token) ||
    Number(reserva.cant_acompanantes) > 0;
    */

/* cargarCodigoQR(
    reserva.id_reserva,
    debeMostrarQR
);
*/

if (!reserva) {
    // Si el usuario entra directamente a esta pantalla
    window.location.href = "inicio.html";
}

// ---------- Usuario ----------
document.getElementById("usuario-nombre").textContent =
    reserva.nombre;

document.getElementById("usuario-avatar").textContent =
    reserva.nombre
        .split(" ")
        .map(n => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

// ---------- Datos reserva ----------
document.getElementById("conf-espacio").textContent =
    reserva.espacio;

document.getElementById("conf-fecha").textContent =
    reserva.fecha;

document.getElementById("conf-hora").textContent =
    `${reserva.horaInicio} - ${reserva.horaFin}`;

document.getElementById("conf-codigo").textContent =
    reserva.codigo;

    configurarTextoConfirmacion();

// =======================================
// Cargar imagen del código QR
// =======================================

async function cargarCodigoQR(idReserva, tieneQR) {

    const contenedorQR =
        document.getElementById("contenedor-qr");

    const qrCargando =
        document.getElementById("qr-cargando");

    const imagenQR =
        document.getElementById("imagen-qr");

    const mensajeQR =
        document.getElementById("mensaje-qr");

    // Si algún elemento no existe en el HTML,
    // evitamos que el código produzca un error.
    if (
        !contenedorQR ||
        !qrCargando ||
        !imagenQR ||
        !mensajeQR
    ) {
        console.error(
            "Faltan elementos del QR en confirmar.html"
        );
        return;
    }

    // Si la reserva no tiene QR,
    // ocultamos todo el espacio.
    if (!idReserva) {
    contenedorQR.hidden = true;
    return;
}

if (!tieneQR) {
    console.log(
        "La reserva no fue marcada para mostrar QR:",
        reserva
    );

    contenedorQR.hidden = true;
    return;
}

contenedorQR.hidden = false;

    try {

        qrCargando.hidden = false;
        imagenQR.hidden = true;
        mensajeQR.hidden = true;

        const respuesta = await fetch(
            `http://localhost:3000/api/qr/${encodeURIComponent(idReserva)}/qr`,
            {
                method: "GET",
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

        // Convertimos la respuesta PNG en una URL
        // que pueda usar la etiqueta <img>.
        const imagenBlob =
            await respuesta.blob();

        const imagenURL =
            URL.createObjectURL(imagenBlob);

        imagenQR.src = imagenURL;
        imagenQR.hidden = false;
        qrCargando.hidden = true;

    } catch (error) {

        console.error(
            "Error cargando el QR:",
            error
        );

        qrCargando.hidden = true;
        imagenQR.hidden = true;

        mensajeQR.textContent =
            error.message;

        mensajeQR.hidden = false;
    }
}

function configurarTextoConfirmacion() {

    const titulo =
        document.getElementById("confirm-titulo");

    const subtitulo =
        document.getElementById("confirm-subtitulo");

    const nombreEspacio =
        String(reserva.espacio || "")
            .trim()
            .toLowerCase();

    const esZonaJaguar =
        nombreEspacio.includes("zona jaguar");

    if (esZonaJaguar) {

        titulo.textContent =
            "¡Solicitud enviada!";

        subtitulo.textContent =
            "Tu solicitud para Zona Jaguar fue registrada correctamente y se encuentra pendiente de aprobación. Recibirás una notificación cuando haya sido aprobada o rechazada.";

    } else {

        titulo.textContent =
            "¡Reserva confirmada!";

        subtitulo.textContent =
            "Tu reserva fue registrada correctamente. Presenta el código de reserva al ingresar al área reservada.";
    }
}

// Mostrar el QR solo cuando la reserva tenga uno
cargarCodigoQR(
    reserva.id_reserva,
    reserva.tiene_qr
);


 // ======================================
// Menú responsive
// ======================================
 function abrirMenu(){
     document
       .querySelector(".sidebar")
        .classList.add("activo");

    document
        .querySelector(".overlay")
        .classList.add("activo");
 }

 function cerrarMenu(){


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
 async function cerrarSesion(){
     try{
         const res = await fetch(
            "http://localhost:3000/api/auth/logout",
            {
                method:"POST",
                credentials:"include"
            }
        );
         const data = await res.json();
         if(data.ok){
             window.location.href="../../login.html";
         }
     }catch(error){
         console.error(error);
     }
 }