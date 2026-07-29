// =======================================
// Variable para guardar la imagen del QR
// =======================================
// Aquí almacenaremos el archivo PNG del QR
// para poder descargarlo después.
let qrBlob = null;


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

    // Botón para descargar el QR
    const btnDescargarQR =
        document.getElementById("btn-descargar-qr");

    const mensajeQR =
        document.getElementById("mensaje-qr");

    // Verificamos que todos los elementos existan
    // antes de continuar.
    if (
        !contenedorQR ||
        !qrCargando ||
        !imagenQR ||
        !mensajeQR ||
        !btnDescargarQR
    ) {
        console.error(
            "Faltan elementos del QR en confirmar.html"
        );
        return;
    }

    // Si la reserva no tiene identificador,
    // ocultamos completamente el contenedor.
    if (!idReserva) {
        contenedorQR.hidden = true;
        return;
    }

    // Si la reserva no debe mostrar QR,
    // también ocultamos el contenedor.
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

        // Mientras carga el QR
        qrCargando.hidden = false;
        imagenQR.hidden = true;
        mensajeQR.hidden = true;

        // Ocultamos el botón hasta que
        // el QR esté listo.
        btnDescargarQR.hidden = true;

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

        // Convertimos el PNG recibido
        // en una imagen que pueda mostrar <img>.
        qrBlob = await respuesta.blob();

        const imagenURL =
            URL.createObjectURL(qrBlob);

        imagenQR.src = imagenURL;
        imagenQR.hidden = false;
        qrCargando.hidden = true;

        // Ahora sí mostramos el botón
        // para descargar el QR.
        btnDescargarQR.hidden = false;

    } catch (error) {

        console.error(
            "Error cargando el QR:",
            error
        );

        qrCargando.hidden = true;
        imagenQR.hidden = true;

        // Si ocurre un error,
        // ocultamos el botón.
        btnDescargarQR.hidden = true;

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

 // =======================================
// Descargar código QR
// =======================================
// Permite guardar el QR como una imagen PNG.
function descargarQR() {

    // Si aún no existe el QR,
    // no hacemos nada.
    if (!qrBlob) return;

    // Creamos una URL temporal
    // con la imagen del QR.
    const url =
        URL.createObjectURL(qrBlob);

    // Creamos un enlace invisible
    // para iniciar la descarga.
    const enlace =
        document.createElement("a");

    enlace.href = url;

    // Nombre del archivo descargado.
    enlace.download =
        `QR-${reserva.codigo}.png`;

    document.body.appendChild(enlace);

    enlace.click();

    enlace.remove();

    // Liberamos la memoria utilizada.
    URL.revokeObjectURL(url);

}

// =======================================
// Evento del botón Descargar QR
// =======================================
// Cuando el usuario haga clic,
// se descargará la imagen.
const btnDescargarQR =
    document.getElementById("btn-descargar-qr");

btnDescargarQR?.addEventListener(
    "click",
    descargarQR
);