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

        // Si el modal de la lista está abierto (o se abre después),
        // que refleje el admin recien creado.
        listaAdministradoresDesactualizada = true;

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


// ==========================================
// CONFIRMACIÓN GENÉRICA (reemplaza window.confirm)
// Uso: const ok = await confirmarAccion({ titulo, mensaje, textoBoton });
// Requiere el modal #modal-confirmar en el HTML de la página.
// Si esa página no lo tiene, cae de vuelta a window.confirm()
// para no romper nada.
// ==========================================

function confirmarAccion({ titulo = 'Confirmar acción', mensaje = '', textoBoton = 'Aceptar' } = {}) {

    const modal = document.getElementById('modal-confirmar');

    if (!modal) {
        return Promise.resolve(window.confirm(mensaje));
    }

    return new Promise((resolve) => {

        document.getElementById('confirmar-titulo').textContent = titulo;
        document.getElementById('confirmar-mensaje').textContent = mensaje;

        const btnAceptar = document.getElementById('confirmar-btn-aceptar');
        const btnCancelar = document.getElementById('confirmar-btn-cancelar');

        btnAceptar.textContent = textoBoton;

        function limpiar() {
            btnAceptar.removeEventListener('click', alAceptar);
            btnCancelar.removeEventListener('click', alCancelar);
            cerrarModalPerfilAdmin('modal-confirmar');
        }

        function alAceptar() {
            limpiar();
            resolve(true);
        }

        function alCancelar() {
            limpiar();
            resolve(false);
        }

        btnAceptar.addEventListener('click', alAceptar);
        btnCancelar.addEventListener('click', alCancelar);

        abrirModalPerfilAdmin('modal-confirmar');
    });
}


// ==========================================
// ADMINISTRAR ADMINISTRADORES (solo superadmin)
// Ver lista + eliminar. Editar/activar-desactivar
// no estan incluidos todavia.
// ==========================================

let listaAdministradoresDesactualizada = true;

function abrirModalAdministrarAdmins() {

    abrirModalPerfilAdmin('modal-administrar-admins');

    if (listaAdministradoresDesactualizada) {
        cargarListaAdministradores();
    }
}

async function cargarListaAdministradores() {

    const contenedor = document.getElementById('lista-administradores');

    if (!contenedor) return;

    contenedor.innerHTML = '<p class="admins-cargando">Cargando administradores...</p>';

    try {

        const res = await fetch(`${API_URL}/api/auth/administradores`, {
            credentials: 'include'
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cargar la lista de administradores.');
        }

        listaAdministradoresDesactualizada = false;

        renderListaAdministradores(data.administradores || []);

    } catch (error) {

        console.error('Error cargando administradores:', error);

        contenedor.innerHTML = `
            <p class="admins-error">
                ${error.message || 'No se pudo cargar la lista de administradores.'}
            </p>
        `;
    }
}

function renderListaAdministradores(administradores) {

    const contenedor = document.getElementById('lista-administradores');

    if (!contenedor) return;

    if (administradores.length === 0) {
        contenedor.innerHTML = '<p class="admins-vacio">No hay administradores registrados.</p>';
        return;
    }

    contenedor.innerHTML = administradores.map(admin => {

        const esUnoMismo = usuarioActual && admin.id_admin === usuarioActual.id;
        const esSuperadmin = Boolean(admin.es_superadmin);
        const puedeEliminar = !esUnoMismo && !esSuperadmin;

        return `
            <div class="admin-row">

                <div class="admin-row-info">
                    <strong>
                        ${escaparPerfil(admin.nombre)}
                        ${esSuperadmin ? '<span class="admin-badge-principal">Principal</span>' : ''}
                        ${esUnoMismo ? '<span class="admin-badge-tu">Tú</span>' : ''}
                    </strong>
                    <small>${escaparPerfil(admin.correo)}</small>
                </div>

                <button
                    type="button"
                    class="admin-row-eliminar"
                    title="${puedeEliminar ? 'Eliminar administrador' : 'No se puede eliminar'}"
                    ${puedeEliminar ? '' : 'disabled'}
                    onclick="eliminarAdministrador(${admin.id_admin}, '${escaparPerfil(admin.nombre).replace(/'/g, "\\'")}')"
                >
                    <i class="bi bi-trash"></i>
                </button>

            </div>
        `;

    }).join('');
}

async function eliminarAdministrador(id_admin, nombre) {

    const confirmado = await confirmarAccion({
        titulo: 'Eliminar administrador',
        mensaje: `¿Eliminar al administrador "${nombre}"? Esta acción no se puede deshacer.`,
        textoBoton: 'Eliminar'
    });

    if (!confirmado) return;

    try {

        const res = await fetch(`${API_URL}/api/auth/administradores/${id_admin}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo eliminar el administrador.');
        }

        mostrarToast('Administrador eliminado correctamente.', 'success');

        await cargarListaAdministradores();

    } catch (error) {

        console.error('Error eliminando administrador:', error);

        mostrarToast(
            error.message || 'No se pudo eliminar el administrador.',
            'danger'
        );
    }
}

// Los nombres/correos vienen de la base: si alguno trae < o &,
// romperia el HTML de la lista.
function escaparPerfil(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}


// ── INICIALIZAR: guarda el usuario y muestra/oculta acciones de superadmin ──
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
                // (ej: paneles donde no aplica administrar administradores)
                document.getElementById('btn-crear-admin')?.style.setProperty('display', 'flex');
                document.getElementById('btn-administrar-admins')?.style.setProperty('display', 'flex');
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