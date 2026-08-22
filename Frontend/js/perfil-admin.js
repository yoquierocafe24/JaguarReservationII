// ======================================
// PERFIL ADMIN — dropdown + modales
// Requiere que la página ya tenga API_URL
// y las funciones mostrarToast() y
// verificarAdmin() definidas.
// ======================================

let usuarioActual = null;


// ── DROPDOWN ──
function alternarDropdownPerfil(evento) {

    evento.stopPropagation();

    document
        .getElementById('admin-user-trigger')
        ?.classList.toggle('abierto');
}

document.addEventListener('click', (evento) => {

    const trigger = document.getElementById('admin-user-trigger');

    if (trigger && !trigger.contains(evento.target)) {
        trigger.classList.remove('abierto');
    }
});


// ── MODALES: abrir / cerrar ──
// Nombres con sufijo "PerfilAdmin" para no chocar con
// abrirModal()/cerrarModal() de otros scripts (ej: calendario.js),
// que usan la misma función pero esperando un ELEMENTO en vez de un ID.
function abrirModalPerfilAdmin(id) {
    document.getElementById(id)?.classList.add('activo');
    document.getElementById('admin-user-trigger')?.classList.remove('abierto');
}

function cerrarModalPerfilAdmin(id) {
    document.getElementById(id)?.classList.remove('activo');
}

function abrirModalPerfil() {

    if (usuarioActual) {
        document.getElementById('perfil-nombre').value = usuarioActual.nombre || '';
        document.getElementById('perfil-correo').value = usuarioActual.correo || '';
    }

    abrirModalPerfilAdmin('modal-perfil');
}

function abrirModalPassword() {

    document.getElementById('password-actual').value = '';
    document.getElementById('password-nueva').value = '';

    abrirModalPerfilAdmin('modal-password');
}

function abrirModalCrearAdmin() {

    document.getElementById('nuevo-admin-nombre').value = '';
    document.getElementById('nuevo-admin-correo').value = '';
    document.getElementById('nuevo-admin-password').value = '';

    abrirModalPerfilAdmin('modal-crear-admin');
}


// ── GUARDAR: EDITAR PERFIL ──
async function guardarPerfil() {

    const nombre = document.getElementById('perfil-nombre').value.trim();
    const correo = document.getElementById('perfil-correo').value.trim();

    if (!nombre || !correo) {
        mostrarToast('Debe completar nombre y correo.', 'danger');
        return;
    }

    try {

        const res = await fetch(`${API_URL}/api/auth/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombre, correo })
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            mostrarToast(data.mensaje || 'No se pudo actualizar el perfil.', 'danger');
            return;
        }

        usuarioActual = data.usuario;

        const nombreElemento = document.getElementById('usuario-nombre');
        const avatarElemento = document.getElementById('usuario-avatar');

        if (nombreElemento) nombreElemento.textContent = data.usuario.nombre;
        if (avatarElemento) avatarElemento.textContent = obtenerInicialesPerfil(data.usuario.nombre);

        mostrarToast('Perfil actualizado correctamente.', 'success');
        cerrarModalPerfilAdmin('modal-perfil');

    } catch (error) {

        console.error(error);
        mostrarToast('No se pudo conectar con el servidor.', 'danger');
    }
}


// ── GUARDAR: CAMBIAR CONTRASEÑA ──
async function guardarPassword() {

    const actual = document.getElementById('password-actual').value;
    const nueva = document.getElementById('password-nueva').value;

    if (!actual || !nueva) {
        mostrarToast('Debe completar ambos campos.', 'danger');
        return;
    }

    if (nueva.length < 8) {
        mostrarToast('La nueva contraseña debe tener al menos 8 caracteres.', 'danger');
        return;
    }

    try {

        const res = await fetch(`${API_URL}/api/auth/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                contrasena_actual: actual,
                contrasena_nueva: nueva
            })
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            mostrarToast(data.mensaje || 'No se pudo cambiar la contraseña.', 'danger');
            return;
        }

        mostrarToast('Contraseña actualizada correctamente.', 'success');
        cerrarModalPerfilAdmin('modal-password');

    } catch (error) {

        console.error(error);
        mostrarToast('No se pudo conectar con el servidor.', 'danger');
    }
}


// ── GUARDAR: CREAR ADMINISTRADOR ──
async function guardarNuevoAdmin() {

    const nombre = document.getElementById('nuevo-admin-nombre').value.trim();
    const correo = document.getElementById('nuevo-admin-correo').value.trim();
    const contrasena = document.getElementById('nuevo-admin-password').value;

    if (!nombre || !correo || !contrasena) {
        mostrarToast('Debe completar todos los campos.', 'danger');
        return;
    }

    if (contrasena.length < 8) {
        mostrarToast('La contraseña debe tener al menos 8 caracteres.', 'danger');
        return;
    }

    try {

        const res = await fetch(`${API_URL}/api/auth/crear-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nombre, correo, contrasena })
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            mostrarToast(data.mensaje || 'No se pudo crear el administrador.', 'danger');
            return;
        }

        mostrarToast('Administrador creado correctamente.', 'success');
        cerrarModalPerfilAdmin('modal-crear-admin');

    } catch (error) {

        console.error(error);
        mostrarToast('No se pudo conectar con el servidor.', 'danger');
    }
}


function obtenerInicialesPerfil(nombre = '') {

    return nombre
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte[0])
        .join('')
        .toUpperCase() || 'A';
}


// ── INICIALIZAR: guarda el usuario y muestra/oculta "Crear administrador" ──
document.addEventListener('DOMContentLoaded', async () => {

    try {

        const res = await fetch(`${API_URL}/api/auth/session`, {
            credentials: 'include'
        });

        const data = await res.json();

        if (data.ok && data.usuario) {

            usuarioActual = data.usuario;

            if (data.usuario.es_superadmin) {

                // Con "?." por si la página no tiene estos elementos
                // (ej: paneles donde no aplica crear administradores)
                document.getElementById('btn-crear-admin')?.style.setProperty('display', 'flex');
                document.getElementById('separador-superadmin')?.style.setProperty('display', 'block');
            }
        }

    } catch (error) {
        console.error('No se pudo verificar el estado de superadmin:', error);
    }

    document
        .getElementById('admin-user-trigger')
        ?.addEventListener('click', alternarDropdownPerfil);
});