const API_URL = "https://jaguarreservationii-production.up.railway.app";

// Actualizar fecha y hora en tiempo real
function updateDateTime() {
    const dateElement = document.getElementById('topbar-date');
 
    if (!dateElement) {
        return;
    }
 
    const now = new Date();
 
    const fecha = now.toLocaleDateString('es-HN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
 
    const hora = now.toLocaleTimeString('es-HN', {
        hour: '2-digit',
        minute: '2-digit'
    });
 
    const fechaFinal =
        fecha.charAt(0).toUpperCase() +
        fecha.slice(1);
 
    dateElement.textContent =
        `${fechaFinal} · ${hora}`;
}
 
async function cargarSesionAdmin() {
    try {
        const response = await fetch(
            `${API_URL}/api/auth/session`,
            {
                credentials: 'include'
            }
        );
 
        const data = await response.json();
 
        if (
            !response.ok ||
            !data.ok ||
            data.usuario?.rol !== 'admin'
        ) {
            window.location.href =
                '../../login.html';
 
            return false;
        }
 
        const nombre =
            data.usuario.nombre || 'Administrador';
 
        const nombreElement =
            document.getElementById('admin-name');
 
        const avatarElement =
            document.getElementById('admin-avatar');
 
        if (nombreElement) {
            nombreElement.textContent = nombre;
        }
 
        if (avatarElement) {
            avatarElement.textContent =
                obtenerIniciales(nombre);
        }
 
        return true;
 
    } catch (error) {
        console.error(
            'Error cargando sesión del administrador:',
            error
        );
 
        setStatus(
            'No se pudo verificar la sesión.',
            true
        );
 
        return false;
    }
}
 
function obtenerIniciales(nombre = '') {
    return nombre
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte[0])
        .join('')
        .toUpperCase() || 'A';
}
 
// Logout
function logout() {
    fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
    }).finally(() => {
        window.location.href = '../../login.html';
    });
}
 
function abrirMenu() {
    document
        .querySelector('.sidebar-admin')
        ?.classList.add('activo');
 
    document
        .getElementById('sidebar-overlay')
        ?.classList.add('activo');
}
 
function cerrarMenu() {
    document
        .querySelector('.sidebar-admin')
        ?.classList.remove('activo');
 
    document
        .getElementById('sidebar-overlay')
        ?.classList.remove('activo');
}
 
 
const elements = {
    tableBody: document.getElementById('guardias-table-body'),
    statusMessage: document.getElementById('status-message'),
    refreshBtn: document.getElementById('refresh-btn'),
    nuevoGuardiaBtn: document.getElementById('nuevo-guardia-btn'),
 
    guardiaModal: document.getElementById('guardia-modal'),
    guardiaModalTitle: document.getElementById('guardia-modal-title'),
    guardiaForm: document.getElementById('guardia-form'),
    guardiaId: document.getElementById('guardia-id'),
    guardiaNombre: document.getElementById('guardia-nombre'),
    guardiaUsuario: document.getElementById('guardia-usuario'),
    guardiaContrasena: document.getElementById('guardia-contrasena'),
    guardiaContrasenaHint: document.getElementById('guardia-contrasena-hint'),
    guardiaFormStatus: document.getElementById('guardia-form-status'),
    guardiaGuardarBtn: document.getElementById('guardia-guardar-btn'),
 
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalTitle: document.getElementById('confirm-modal-title'),
    confirmModalConfirmBtn: document.querySelector('#confirm-modal [data-action="confirm"]'),
    confirmModalCancelBtn: document.querySelector('#confirm-modal [data-action="cancel"]'),
    confirmModalCloseBtn: document.querySelector('#confirm-modal .modal-close-btn'),
    confirmModalBackdrop: document.querySelector('#confirm-modal .custom-modal-backdrop')
};
 
const state = {
    guardias: [],
    confirmAction: null
};
 
function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
 
function setStatus(message, isError = false) {
    if (!elements.statusMessage) return;
    elements.statusMessage.textContent = message;
    elements.statusMessage.classList.toggle('error', isError);
}
 
function setFormStatus(message, isError = false) {
    if (!elements.guardiaFormStatus) return;
    elements.guardiaFormStatus.textContent = message;
    elements.guardiaFormStatus.classList.toggle('error', isError);
}
 
function abrirModalConfirmacion({ title, message, confirmText = 'Confirmar', onConfirm }) {
    if (!elements.confirmModal) return;
 
    if (elements.confirmModalTitle) {
        elements.confirmModalTitle.textContent = title || 'Confirmar acción';
    }
 
    if (elements.confirmModalMessage) {
        elements.confirmModalMessage.textContent = message || '¿Deseas continuar?';
    }
 
    if (elements.confirmModalConfirmBtn) {
        elements.confirmModalConfirmBtn.textContent = confirmText;
    }
 
    state.confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    elements.confirmModal.classList.remove('hidden');
    elements.confirmModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}
 
function cerrarModalConfirmacion() {
    if (!elements.confirmModal) return;
 
    elements.confirmModal.classList.add('hidden');
    elements.confirmModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    state.confirmAction = null;
}
 
// =======================================
// Cargar y renderizar guardias
// =======================================
 
async function cargarGuardias() {
    try {
        setStatus('Cargando guardias...');
 
        const response = await fetch(`${API_URL}/api/guardia`, {
            credentials: 'include'
        });
 
        const data = await response.json();
 
        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudieron cargar los guardias');
        }
 
        state.guardias = data.guardias || [];
 
        setStatus(`${state.guardias.length} guardia(s) registrados.`);
        renderGuardias();
 
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al cargar los guardias.', true);
    }
}
 
function renderGuardias() {
    if (!elements.tableBody) return;
 
    if (!state.guardias.length) {
        elements.tableBody.innerHTML = '<tr><td colspan="3" class="empty-state">No hay guardias registrados.</td></tr>';
        return;
    }
 
    elements.tableBody.innerHTML = state.guardias.map((guardia) => `
        <tr>
            <td>${escapeHtml(guardia.nombre)}</td>
            <td>${escapeHtml(guardia.usuario)}</td>
            <td>
                <div class="acciones-celda">
                    <button type="button" class="action-btn" data-editar="${guardia.id_guardia}">Editar</button>
                    <button type="button" class="action-btn eliminar" data-eliminar="${guardia.id_guardia}">Eliminar</button>
                </div>
            </td>
        </tr>
    `).join('');
}
 
function manejarClicTabla(event) {
    const btnEditar = event.target.closest('[data-editar]');
    const btnEliminar = event.target.closest('[data-eliminar]');
 
    if (btnEditar) {
        abrirModalGuardia(btnEditar.dataset.editar);
        return;
    }
 
    if (btnEliminar) {
        solicitarConfirmacionEliminar(btnEliminar.dataset.eliminar);
    }
}
 
// =======================================
// Crear / editar guardia
// =======================================
 
function abrirModalGuardia(idGuardia) {
    elements.guardiaForm.reset();
    setFormStatus('');
 
    if (idGuardia) {
 
        const guardia = state.guardias.find(g => String(g.id_guardia) === String(idGuardia));
        if (!guardia) return;
 
        elements.guardiaModalTitle.textContent = 'Editar guardia';
        elements.guardiaId.value = guardia.id_guardia;
        elements.guardiaNombre.value = guardia.nombre;
        elements.guardiaUsuario.value = guardia.usuario;
        elements.guardiaContrasena.required = false;
        elements.guardiaContrasenaHint.textContent = 'Deja este campo en blanco para no cambiar la contraseña.';
 
    } else {
 
        elements.guardiaModalTitle.textContent = 'Nuevo guardia';
        elements.guardiaId.value = '';
        elements.guardiaContrasena.required = true;
        elements.guardiaContrasenaHint.textContent = 'Mínimo 6 caracteres.';
 
    }
 
    abrirModal(elements.guardiaModal);
}
 
async function guardarGuardia(event) {
    event.preventDefault();
 
    const idGuardia = elements.guardiaId.value;
 
    const payload = {
        nombre: elements.guardiaNombre.value.trim(),
        usuario: elements.guardiaUsuario.value.trim(),
        contrasena: elements.guardiaContrasena.value || undefined
    };
 
    if (!payload.nombre || !payload.usuario) {
        setFormStatus('Debes indicar nombre y usuario.', true);
        return;
    }
 
    if (!idGuardia && !payload.contrasena) {
        setFormStatus('Debes indicar una contraseña para el nuevo guardia.', true);
        return;
    }
 
    try {
        elements.guardiaGuardarBtn.disabled = true;
        setFormStatus('Guardando...');
 
        const response = await fetch(
            idGuardia ? `${API_URL}/api/guardia/${idGuardia}` : `${API_URL}/api/guardia`,
            {
                method: idGuardia ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );
 
        const data = await response.json();
 
        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo guardar el guardia.');
        }
 
        cerrarModal(elements.guardiaModal);
        await cargarGuardias();
 
    } catch (error) {
        console.error(error);
        setFormStatus(error.message || 'Ocurrió un error al guardar el guardia.', true);
    } finally {
        elements.guardiaGuardarBtn.disabled = false;
    }
}
 
// =======================================
// Eliminar guardia
// =======================================
 
function solicitarConfirmacionEliminar(idGuardia) {
    const guardia = state.guardias.find(g => String(g.id_guardia) === String(idGuardia));
 
    abrirModalConfirmacion({
        title: 'Eliminar guardia',
        message: `¿Deseas eliminar a ${guardia ? guardia.nombre : 'este guardia'}? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
            await eliminarGuardia(idGuardia);
        }
    });
}
 
async function eliminarGuardia(idGuardia) {
    try {
        setStatus('Eliminando guardia...');
 
        const response = await fetch(`${API_URL}/api/guardia/${idGuardia}`, {
            method: 'DELETE',
            credentials: 'include'
        });
 
        const data = await response.json();
 
        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo eliminar el guardia.');
        }
 
        await cargarGuardias();
 
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al eliminar el guardia.', true);
    }
}
 
// =======================================
// Modales genéricos
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
 
// =======================================
// Inicialización
// =======================================
 
document.addEventListener('DOMContentLoaded', async () => {
 
    updateDateTime();
    setInterval(updateDateTime, 60000);
 
    const sesionValida =
        await cargarSesionAdmin();
 
    if (!sesionValida) {
        return;
    }
 
    elements.refreshBtn?.addEventListener('click', cargarGuardias);
    elements.nuevoGuardiaBtn?.addEventListener('click', () => abrirModalGuardia(null));
    elements.tableBody?.addEventListener('click', manejarClicTabla);
    elements.guardiaForm?.addEventListener('submit', guardarGuardia);
 
    document.querySelectorAll('#guardia-modal [data-action="close-form"]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(elements.guardiaModal));
    });
 
    elements.confirmModalCancelBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalCloseBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalBackdrop?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalConfirmBtn?.addEventListener('click', async () => {
        if (typeof state.confirmAction === 'function') {
            cerrarModalConfirmacion();
            await state.confirmAction();
        }
    });
 
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
 
        if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
            cerrarModalConfirmacion();
        }
 
        if (elements.guardiaModal && !elements.guardiaModal.classList.contains('hidden')) {
            cerrarModal(elements.guardiaModal);
        }
    });
 
    await cargarGuardias();
});
 