const API_URL = "https://jaguarreservationii-production.up.railway.app";

// =======================================
// Fecha/hora en la topbar
// =======================================
function updateDateTime() {
    const dateElement = document.getElementById('topbar-fecha');
    if (!dateElement) return;

    const now = new Date();

    const fecha = now.toLocaleDateString('es-HN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const hora = now.toLocaleTimeString('es-HN', {
        hour: '2-digit', minute: '2-digit'
    });

    dateElement.textContent =
        `${fecha.charAt(0).toUpperCase() + fecha.slice(1)} · ${hora}`;
}

function obtenerIniciales(nombre = '') {
    return nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        .map(p => p[0]).join('').toUpperCase() || 'A';
}

async function cargarSesionAdmin() {
    try {
        const response = await fetch(`${API_URL}/api/auth/session`, { credentials: 'include' });
        const data = await response.json();

        if (!response.ok || !data.ok || data.usuario?.rol !== 'admin') {
            window.location.href = '../../login.html';
            return false;
        }

        const nombre = data.usuario.nombre || 'Administrador';

        const nombreEl = document.getElementById('usuario-nombre');
        const avatarEl = document.getElementById('usuario-avatar');

        if (nombreEl) nombreEl.textContent = nombre;
        if (avatarEl) avatarEl.textContent = obtenerIniciales(nombre);

        return true;

    } catch (error) {
        console.error('Error cargando sesión del administrador:', error);
        setStatus('No se pudo verificar la sesión.', true);
        return false;
    }
}

function cerrarSesion() {
    fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
        .finally(() => window.location.href = '../../login.html');
}

function abrirMenu() {
    document.querySelector('.sidebar-admin')?.classList.add('activo');
    document.getElementById('sidebar-overlay')?.classList.add('activo');
}

function cerrarMenu() {
    document.querySelector('.sidebar-admin')?.classList.remove('activo');
    document.getElementById('sidebar-overlay')?.classList.remove('activo');
}

function mostrarToast(mensaje, tipo = 'danger') {
    const toast = document.getElementById('toastMensaje');
    if (!toast) { console.log(mensaje); return; }

    toast.querySelector('.toast-body').textContent = mensaje;
    toast.className = `toast text-bg-${tipo}`;

    new bootstrap.Toast(toast).show();
}

function setStatus(mensaje, esError = false) {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = mensaje;
    el.classList.toggle('error', esError);
}

function escapar(texto = '') {
    return String(texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =======================================
// Modales genéricos (elemento como parámetro,
// igual patrón que calendario.js / guardiaAdmin.js.
// No chocan con abrirModalPerfilAdmin/cerrarModalPerfilAdmin
// de perfil-admin.js, que reciben un ID en vez de elemento).
// =======================================

function abrirModal(modalEl) {
    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function cerrarModal(modalEl) {
    modalEl.classList.add('hidden');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

let confirmAction = null;

function abrirModalConfirmacion({ title, message, confirmText = 'Confirmar', onConfirm }) {
    document.getElementById('confirm-modal-title').textContent = title || 'Confirmar acción';
    document.getElementById('confirm-modal-message').textContent = message || '¿Deseas continuar?';
    document.getElementById('confirm-modal-confirm-btn').textContent = confirmText;

    confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    abrirModal(document.getElementById('confirm-modal'));
}

// =======================================
// Estado en memoria
// =======================================

const state = {
    equipos: [],
    equipoActualId: null,
    integrantesActuales: []
};

// =======================================
// Cargar y renderizar equipos
// =======================================

async function cargarEquipos() {
    try {
        setStatus('Cargando equipos...');

        const res = await fetch(`${API_URL}/api/equipos?incluir_inactivos=true`, {
            credentials: 'include'
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudieron cargar los equipos.');
        }

        state.equipos = data.equipos || [];

        renderStats();
        renderTablaEquipos();

        setStatus(`Última actualización: ${new Date().toLocaleString()}`);

    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al cargar los equipos.', true);
    }
}

function renderStats() {
    const total = state.equipos.length;
    const activos = state.equipos.filter(e => Number(e.activo) === 1).length;

    document.getElementById('total-equipos').textContent = total;
    document.getElementById('total-activos').textContent = activos;
    document.getElementById('total-inactivos').textContent = total - activos;
}

function obtenerEquiposFiltrados() {
    const estadoFiltro = document.getElementById('filtro-estado-equipo').value;
    const texto = document.getElementById('filtro-buscar-equipo').value.trim().toLowerCase();

    return state.equipos.filter(equipo => {
        const coincideEstado = estadoFiltro === '' || String(equipo.activo) === estadoFiltro;
        const coincideTexto = !texto || equipo.nombre.toLowerCase().includes(texto);
        return coincideEstado && coincideTexto;
    });
}

function renderTablaEquipos() {
    const cuerpo = document.getElementById('tabla-equipos-body');
    const vacio = document.getElementById('tabla-equipos-vacia');

    const equipos = obtenerEquiposFiltrados();

    if (!equipos.length) {
        cuerpo.innerHTML = '';
        vacio.style.display = 'block';
        return;
    }

    vacio.style.display = 'none';

    cuerpo.innerHTML = equipos.map(equipo => {

        const activo = Number(equipo.activo) === 1;
        const totalIntegrantes = (equipo.integrantes || []).filter(i => Number(i.activo) === 1).length;

        return `
            <tr>
                <td>${escapar(equipo.nombre)}</td>
                <td>${escapar(equipo.deporte || '—')}</td>
                <td>${equipo.lider_nombre ? escapar(equipo.lider_nombre) : '<span class="empty-state">Sin líder</span>'}</td>
                <td>${totalIntegrantes}</td>
                <td><span class="badge ${activo ? 'active' : 'inactive'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div class="acciones-celda">
                        <button type="button" class="action-btn" onclick="abrirDetalleEquipo(${equipo.id_equipo})">
                            <i class="bi bi-eye"></i> Ver
                        </button>
                        <button type="button" class="action-btn" onclick="abrirModalEquipo(${equipo.id_equipo})">
                            <i class="bi bi-pencil"></i> Editar
                        </button>
                        <button type="button" class="action-btn ${activo ? 'eliminar' : 'activar'}" onclick="alternarEstadoEquipo(${equipo.id_equipo}, ${activo ? 0 : 1})">
                            <i class="bi bi-${activo ? 'slash-circle' : 'check-circle'}"></i> ${activo ? 'Inactivar' : 'Activar'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// =======================================
// Crear / editar equipo
// =======================================

function abrirModalEquipo(idEquipo) {

    document.getElementById('equipo-form-status').textContent = '';
    document.getElementById('equipo-id').value = idEquipo || '';

    if (idEquipo) {

        const equipo = state.equipos.find(e => Number(e.id_equipo) === Number(idEquipo));
        if (!equipo) return;

        document.getElementById('modal-equipo-title').textContent = 'Editar equipo/club';
        document.getElementById('equipo-nombre').value = equipo.nombre;
        document.getElementById('equipo-deporte').value = equipo.deporte || '';

    } else {

        document.getElementById('modal-equipo-title').textContent = 'Nuevo equipo/club';
        document.getElementById('equipo-nombre').value = '';
        document.getElementById('equipo-deporte').value = '';
    }

    abrirModal(document.getElementById('modal-equipo'));
}

async function guardarEquipo() {

    const idEquipo = document.getElementById('equipo-id').value;
    const nombre = document.getElementById('equipo-nombre').value.trim();
    const deporte = document.getElementById('equipo-deporte').value.trim();
    const status = document.getElementById('equipo-form-status');

    status.textContent = '';
    status.classList.remove('error');

    if (!nombre || !deporte) {
        status.textContent = 'Debe completar nombre y deporte/categoría.';
        status.classList.add('error');
        return;
    }

    try {

        document.getElementById('btn-guardar-equipo').disabled = true;

        const res = await fetch(
            idEquipo ? `${API_URL}/api/equipos/${idEquipo}` : `${API_URL}/api/equipos`,
            {
                method: idEquipo ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, deporte })
            }
        );

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo guardar el equipo.');
        }

        cerrarModal(document.getElementById('modal-equipo'));
        mostrarToast(data.mensaje || 'Equipo guardado correctamente.', 'success');
        await cargarEquipos();

    } catch (error) {
        console.error(error);
        status.textContent = error.message || 'Ocurrió un error al guardar el equipo.';
        status.classList.add('error');
    } finally {
        document.getElementById('btn-guardar-equipo').disabled = false;
    }
}

// =======================================
// Activar / inactivar equipo
// =======================================

function alternarEstadoEquipo(idEquipo, nuevoEstado) {

    abrirModalConfirmacion({
        title: nuevoEstado === 1 ? 'Activar equipo' : 'Inactivar equipo',
        message: nuevoEstado === 1
            ? '¿Deseas activar este equipo/club?'
            : '¿Deseas inactivar este equipo/club? No podrá usarse para nuevas reservas hasta que se reactive.',
        confirmText: nuevoEstado === 1 ? 'Activar' : 'Inactivar',
        onConfirm: async () => {

            try {

                const ruta = nuevoEstado === 1 ? 'activar' : 'inactivar';

                const res = await fetch(`${API_URL}/api/equipos/${idEquipo}/${ruta}`, {
                    method: 'PUT',
                    credentials: 'include'
                });

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    throw new Error(data.mensaje || 'No se pudo actualizar el equipo.');
                }

                mostrarToast(data.mensaje || 'Equipo actualizado correctamente.', 'success');
                await cargarEquipos();

            } catch (error) {
                console.error(error);
                mostrarToast(error.message || 'Ocurrió un error al actualizar el equipo.', 'danger');
            }
        }
    });
}

// =======================================
// Detalle de equipo + integrantes
// =======================================

async function abrirDetalleEquipo(idEquipo) {

    state.equipoActualId = idEquipo;

    document.getElementById('integrante-cuenta').value = '';
    document.getElementById('integrante-nombre-preview').textContent = '';
    document.getElementById('integrante-rol').value = 'jugador';
    document.getElementById('integrante-form-status').textContent = '';

    try {

        const res = await fetch(`${API_URL}/api/equipos/${idEquipo}`, { credentials: 'include' });
        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cargar el equipo.');
        }

        const equipo = data.equipo;
        state.integrantesActuales = equipo.integrantes || [];

        document.getElementById('detalle-equipo-titulo').textContent =
            `${equipo.nombre} — ${equipo.deporte || ''}`;

        renderTablaIntegrantes();

        abrirModal(document.getElementById('modal-detalle-equipo'));

    } catch (error) {
        console.error(error);
        mostrarToast(error.message || 'No se pudo cargar el detalle del equipo.', 'danger');
    }
}

function renderTablaIntegrantes() {

    const cuerpo = document.getElementById('tabla-integrantes-body');
    const vacio = document.getElementById('integrantes-vacio');

    const integrantes = state.integrantesActuales;

    if (!integrantes.length) {
        cuerpo.innerHTML = '';
        vacio.style.display = 'block';
        return;
    }

    vacio.style.display = 'none';

    const rolLabel = { lider: 'Líder', sublider: 'Sublíder', jugador: 'Jugador' };

    cuerpo.innerHTML = integrantes.map(integrante => {

        const activo = Number(integrante.activo) === 1;

        // El líder solo se transfiere con "Hacer líder", no con
        // el select de rol normal (esa acción tiene su propia regla
        // de negocio: solo puede haber un líder activo por equipo).
        const accionesRol = activo && integrante.rol !== 'lider'
            ? `
                <button type="button" class="action-btn" onclick="cambiarRolIntegrante(${integrante.id}, 'sublider')">Hacer sublíder</button>
                <button type="button" class="action-btn" onclick="cambiarRolIntegrante(${integrante.id}, 'jugador')">Hacer jugador</button>
                <button type="button" class="action-btn" onclick="hacerLiderIntegrante(${integrante.id})">Hacer líder</button>
            `
            : '';

        const accionInactivar = activo
            ? `<button type="button" class="action-btn eliminar" onclick="inactivarIntegrante(${integrante.id})"><i class="bi bi-slash-circle"></i> Inactivar</button>`
            : `<span class="empty-state">—</span>`;

        return `
            <tr>
                <td>${escapar(integrante.estudiante_nombre)}</td>
                <td>${escapar(integrante.estudiante_cuenta)}</td>
                <td>${rolLabel[integrante.rol] || integrante.rol}</td>
                <td><span class="badge ${activo ? 'active' : 'inactive'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div class="acciones-celda">
                        ${accionesRol}
                        ${accionInactivar}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// =======================================
// Buscar estudiante por cuenta (autocompletar nombre)
// =======================================

let timeoutBusquedaIntegrante = null;

function buscarEstudianteIntegrante() {

    clearTimeout(timeoutBusquedaIntegrante);

    const cuenta = document.getElementById('integrante-cuenta').value.trim();
    const preview = document.getElementById('integrante-nombre-preview');

    if (!cuenta) {
        preview.textContent = '';
        return;
    }

    timeoutBusquedaIntegrante = setTimeout(async () => {

        try {

            const res = await fetch(
                `${API_URL}/api/equipos/estudiantes/estado?cuenta=${encodeURIComponent(cuenta)}`,
                { credentials: 'include' }
            );

            const data = await res.json();

            if (!res.ok || !data.ok || !data.estudiante) {
                preview.textContent = 'No se encontró un estudiante activo con esa cuenta.';
                preview.classList.add('error');
                return;
            }

            preview.textContent = `${data.estudiante.nombre}`;
            preview.classList.remove('error');

        } catch (error) {
            console.error(error);
            preview.textContent = 'No se pudo verificar la cuenta.';
            preview.classList.add('error');
        }

    }, 400);
}

async function agregarIntegrante() {

    const cuenta = document.getElementById('integrante-cuenta').value.trim();
    const rol = document.getElementById('integrante-rol').value;
    const status = document.getElementById('integrante-form-status');

    status.textContent = '';
    status.classList.remove('error');

    if (!cuenta) {
        status.textContent = 'Debe indicar el número de cuenta.';
        status.classList.add('error');
        return;
    }

    try {

        document.getElementById('btn-agregar-integrante').disabled = true;

        const res = await fetch(`${API_URL}/api/equipos/${state.equipoActualId}/integrantes`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuenta, rol })
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo agregar el integrante.');
        }

        mostrarToast(data.mensaje || 'Integrante agregado correctamente.', 'success');

        document.getElementById('integrante-cuenta').value = '';
        document.getElementById('integrante-nombre-preview').textContent = '';

        await abrirDetalleEquipo(state.equipoActualId);
        await cargarEquipos();

    } catch (error) {
        console.error(error);
        status.textContent = error.message || 'Ocurrió un error al agregar el integrante.';
        status.classList.add('error');
    } finally {
        document.getElementById('btn-agregar-integrante').disabled = false;
    }
}

// =======================================
// Cambiar rol / hacer líder / inactivar integrante
// =======================================

async function cambiarRolIntegrante(idIntegrante, nuevoRol) {

    try {

        const res = await fetch(
            `${API_URL}/api/equipos/${state.equipoActualId}/integrantes/${idIntegrante}/rol`,
            {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rol: nuevoRol })
            }
        );

        const data = await res.json();

        if (!res.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cambiar el rol.');
        }

        mostrarToast(data.mensaje || 'Rol actualizado correctamente.', 'success');
        await abrirDetalleEquipo(state.equipoActualId);
        await cargarEquipos();

    } catch (error) {
        console.error(error);
        mostrarToast(error.message || 'Ocurrió un error al cambiar el rol.', 'danger');
    }
}

function hacerLiderIntegrante(idIntegrante) {

    abrirModalConfirmacion({
        title: 'Transferir liderazgo',
        message: 'Esta persona pasará a ser el nuevo líder del equipo, y el líder actual pasará a otro rol. ¿Deseas continuar?',
        confirmText: 'Confirmar',
        onConfirm: async () => {

            try {

                const res = await fetch(
                    `${API_URL}/api/equipos/${state.equipoActualId}/lider/${idIntegrante}`,
                    { method: 'PUT', credentials: 'include' }
                );

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    throw new Error(data.mensaje || 'No se pudo transferir el liderazgo.');
                }

                mostrarToast(data.mensaje || 'Liderazgo transferido correctamente.', 'success');
                await abrirDetalleEquipo(state.equipoActualId);
                await cargarEquipos();

            } catch (error) {
                console.error(error);
                mostrarToast(error.message || 'Ocurrió un error al transferir el liderazgo.', 'danger');
            }
        }
    });
}

function inactivarIntegrante(idIntegrante) {

    abrirModalConfirmacion({
        title: 'Inactivar integrante',
        message: '¿Deseas inactivar a este integrante del equipo?',
        confirmText: 'Inactivar',
        onConfirm: async () => {

            try {

                const res = await fetch(
                    `${API_URL}/api/equipos/${state.equipoActualId}/integrantes/${idIntegrante}/inactivar`,
                    { method: 'PUT', credentials: 'include' }
                );

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    throw new Error(data.mensaje || 'No se pudo inactivar al integrante.');
                }

                mostrarToast(data.mensaje || 'Integrante inactivado correctamente.', 'success');
                await abrirDetalleEquipo(state.equipoActualId);
                await cargarEquipos();

            } catch (error) {
                console.error(error);
                mostrarToast(error.message || 'Ocurrió un error al inactivar al integrante.', 'danger');
            }
        }
    });
}

// =======================================
// Inicialización
// =======================================

document.addEventListener('DOMContentLoaded', async () => {

    updateDateTime();
    setInterval(updateDateTime, 60000);

    const sesionValida = await cargarSesionAdmin();
    if (!sesionValida) return;

    document.getElementById('nuevo-equipo-btn')?.addEventListener('click', () => abrirModalEquipo(null));
    document.getElementById('btn-guardar-equipo')?.addEventListener('click', guardarEquipo);
    document.getElementById('btn-agregar-integrante')?.addEventListener('click', agregarIntegrante);

    document.querySelectorAll('[data-action="close-equipo"]').forEach(el =>
        el.addEventListener('click', () => cerrarModal(document.getElementById('modal-equipo')))
    );

    document.querySelectorAll('[data-action="close-detalle-equipo"]').forEach(el =>
        el.addEventListener('click', () => cerrarModal(document.getElementById('modal-detalle-equipo')))
    );

    document.querySelectorAll('[data-action="close-confirm"]').forEach(el =>
        el.addEventListener('click', () => cerrarModal(document.getElementById('confirm-modal')))
    );

    document.getElementById('confirm-modal-confirm-btn')?.addEventListener('click', async () => {
        const accion = confirmAction;
        cerrarModal(document.getElementById('confirm-modal'));
        if (typeof accion === 'function') await accion();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        ['modal-equipo', 'modal-detalle-equipo', 'confirm-modal'].forEach(id => {
            const modal = document.getElementById(id);
            if (modal && !modal.classList.contains('hidden')) cerrarModal(modal);
        });
    });

    await cargarEquipos();
});