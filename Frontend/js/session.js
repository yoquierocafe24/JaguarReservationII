async function cargarSesion() {
    try {
        const respuesta = await fetch(
            'http://localhost:3000/api/auth/session',
            {
                credentials: 'include'
            }
        );
        const data = await respuesta.json();
     if (!data.ok) {
    console.log("NO HAY SESIÓN");
    return;
}
        const usuario = data.usuario;

        // Nombre en la barra superior
        const nombre = document.getElementById("usuario-nombre");
        if(nombre){
            nombre.textContent = usuario.nombre;
        }
        // Avatar con iniciales
        const avatar = document.getElementById("usuario-avatar");
        if(avatar){
            avatar.textContent =
            usuario.nombre
            .split(" ")
            .map(letra => letra[0])
            .join("")
            .substring(0,2)
            .toUpperCase();
        }
        // Campos automáticos del formulario reservar
        const campoNombre =
        document.getElementById("campo-nombre");
        const campoCorreo =
        document.getElementById("campo-correo");
        const campoCuenta =
        document.getElementById("campo-cuenta");
        if(campoNombre){
            campoNombre.value = usuario.nombre;
        }
        if(campoCorreo){
            campoCorreo.value = usuario.correo;
        }
        if(campoCuenta){
            campoCuenta.value = usuario.cuenta;
        }
    }catch(error){
        console.error(
            "Error cargando sesión:",
            error
        );
    }

}


cargarSesion();