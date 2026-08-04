// const API_URL =
// "https://jaguarreservationii-production.up.railway.app";


function seleccionarEspacio(espacio){

    sessionStorage.setItem(
        "espacioSeleccionado",
        espacio
    );


    window.location.href = "reservar.html";

}

async function cerrarSesion() {

      console.log("Entró a cerrarSesion");

    try {

        const res = await fetch(
    `${API_URL}/api/auth/logout`, {

            method: "POST",
            credentials: "include"

        });

        const data = await res.json();

        if (data.ok) {

            // Redirige al login
            window.location.href = "../../login.html";

        } else {

            mostrarToast("No se pudo cerrar la sesión.", "danger");

        }

    } catch (error) {

        console.error(error);

        mostrarToast("Error al cerrar la sesión.", "danger");

    }

}

function abrirMenu(){

    document.querySelector(".sidebar")
    .classList.add("activo");


    document.querySelector(".overlay")
    .classList.add("activo");

}



function cerrarMenu(){

    document.querySelector(".sidebar")
    .classList.remove("activo");


    document.querySelector(".overlay")
    .classList.remove("activo");

}

