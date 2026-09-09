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
            document.getElementById('usuario-nombre');

        const avatarElement =
            document.getElementById('usuario-avatar');

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
    tableBody: document.getElementById('equipos-table-body'),
    statusMessage: document.getElementById('status-message'),
    refreshBtn: document.getElementById('refresh-btn'),
    nuevoEquipoBtn: document.getElementById('nuevo-equipo-btn'),
    incluirInactivosCheck: document.getElementById('incluir-inactivos-check'),
    equiposPaginacion: document.getElementById('equipos-paginacion'),

    equipoModal: document.getElementById('equipo-modal'),
    equipoModalTitle: document.getElementById('equipo-modal-title'),
    equipoForm: document.getElementById('equipo-form'),
    equipoId: document.getElementById('equipo-id'),
    equipoNombre: document.getElementById('equipo-nombre'),
    equipoDeporte: document.getElementById('equipo-deporte'),
    equipoFormStatus: document.getElementById('equipo-form-status'),
    equipoGuardarBtn: document.getElementById('equipo-guardar-btn'),

    integrantesModal: document.getElementById('integrantes-modal'),
    integrantesModalTitle: document.getElementById('integrantes-modal-title'),
    integrantesList: document.getElementById('integrantes-list'),
    integranteCuenta: document.getElementById('integrante-cuenta'),
    integranteRol: document.getElementById('integrante-rol'),
    integranteEstudiantePreview: document.getElementById('integrante-estudiante-preview'),
    integranteFormStatus: document.getElementById('integrante-form-status'),
    btnAgregarIntegrante: document.getElementById('btn-agregar-integrante'),

    confirmModal: document.getElementById('confirm-modal'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalTitle: document.getElementById('confirm-modal-title'),
    confirmModalConfirmBtn: document.querySelector('#confirm-modal [data-action="confirm"]'),
    confirmModalCancelBtn: document.querySelector('#confirm-modal [data-action="cancel"]'),
    confirmModalCloseBtn: document.querySelector('#confirm-modal .modal-close-btn'),
    confirmModalBackdrop: document.querySelector('#confirm-modal .custom-modal-backdrop'),

    clubTableBody: document.getElementById('clubes-table-body'),
    statusMessageClub: document.getElementById('status-message-club'),
    refreshClubBtn: document.getElementById('refresh-club-btn'),
    nuevoClubBtn: document.getElementById('nuevo-club-btn'),
    incluirInactivosClubCheck: document.getElementById('incluir-inactivos-club-check'),
    clubesPaginacion: document.getElementById('clubes-paginacion'),

    clubModal: document.getElementById('club-modal'),
    clubModalTitle: document.getElementById('club-modal-title'),
    clubForm: document.getElementById('club-form'),
    clubId: document.getElementById('club-id'),
    clubNombre: document.getElementById('club-nombre'),
    clubFormStatus: document.getElementById('club-form-status'),
    clubGuardarBtn: document.getElementById('club-guardar-btn'),

    clubIntegrantesModal: document.getElementById('club-integrantes-modal'),
    clubIntegrantesModalTitle: document.getElementById('club-integrantes-modal-title'),
    clubIntegrantesList: document.getElementById('club-integrantes-list'),
    clubIntegranteCuenta: document.getElementById('club-integrante-cuenta'),
    clubIntegranteEstudiantePreview: document.getElementById('club-integrante-estudiante-preview'),
    clubIntegranteFormStatus: document.getElementById('club-integrante-form-status'),
    btnAgregarIntegranteClub: document.getElementById('btn-agregar-integrante-club')
};

const EQUIPOS_POR_PAGINA = 5;
const CLUBES_POR_PAGINA = 5;

const state = {
    equipos: [],
    equipoIdActivo: null, // equipo cuyo modal de integrantes está abierto
    confirmAction: null,
    buscaCuentaTimeout: null,
    paginaActualEquipos: 1,

    clubes: [],
    clubIdActivo: null, // club cuyo modal de integrantes está abierto
    buscaCuentaClubTimeout: null,
    paginaActualClubes: 1
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

function setEquipoFormStatus(message, isError = false) {
    if (!elements.equipoFormStatus) return;
    elements.equipoFormStatus.textContent = message;
    elements.equipoFormStatus.classList.toggle('error', isError);
}

function setIntegranteFormStatus(message, isError = false) {
    if (!elements.integranteFormStatus) return;
    elements.integranteFormStatus.textContent = message;
    elements.integranteFormStatus.classList.toggle('error', isError);
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
// Cargar y renderizar equipos
// =======================================

async function cargarEquipos() {
    try {
        setStatus('Cargando equipos...');

        const params = new URLSearchParams();

        if (elements.incluirInactivosCheck?.checked) {
            params.set('incluir_inactivos', 'true');
        }

        const response = await fetch(`${API_URL}/api/equipos?${params.toString()}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudieron cargar los equipos');
        }

        state.equipos = data.equipos || [];
        state.paginaActualEquipos = 1;

        setStatus(`${state.equipos.length} equipo(s) registrados.`);
        renderEquipos();

    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al cargar los equipos.', true);
    }
}

function renderEquipos() {
    if (!elements.tableBody) return;

    if (!state.equipos.length) {
        elements.tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay equipos registrados.</td></tr>';

        if (elements.equiposPaginacion) {
            elements.equiposPaginacion.innerHTML = '';
        }

        return;
    }

    const totalPaginas = Math.max(
        1,
        Math.ceil(state.equipos.length / EQUIPOS_POR_PAGINA)
    );

    state.paginaActualEquipos = Math.min(
        state.paginaActualEquipos,
        totalPaginas
    );

    const inicio = (state.paginaActualEquipos - 1) * EQUIPOS_POR_PAGINA;

    const equiposDeLaPagina = state.equipos.slice(
        inicio,
        inicio + EQUIPOS_POR_PAGINA
    );

    elements.tableBody.innerHTML = equiposDeLaPagina.map((equipo) => {

        const integrantesActivos = (equipo.integrantes || []).filter(i => i.activo).length;

        return `
            <tr class="${equipo.activo ? '' : 'inactivo'}">
                <td>${escapeHtml(equipo.nombre)}</td>
                <td>${escapeHtml(equipo.deporte)}</td>
                <td>${equipo.lider_nombre ? escapeHtml(equipo.lider_nombre) : '<span class="integrantes-count">Sin líder</span>'}</td>
                <td><span class="integrantes-count">${integrantesActivos} activo(s)</span></td>
                <td><span class="chip ${equipo.activo ? 'activo' : 'inactivo'}">${equipo.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div class="acciones-celda">
                        <button type="button" class="action-btn" data-integrantes="${equipo.id_equipo}">Integrantes</button>
                        <button type="button" class="action-btn secundario" data-editar="${equipo.id_equipo}">Editar</button>
                        ${equipo.activo
                            ? `<button type="button" class="action-btn secundario" data-inactivar="${equipo.id_equipo}">Inactivar</button>`
                            : `<button type="button" class="action-btn exito" data-activar="${equipo.id_equipo}">Activar</button>`
                        }
                    </div>
                </td>
            </tr>
        `;

    }).join('');

    renderPaginacionEquipos(totalPaginas);
}

function renderPaginacionEquipos(totalPaginas) {
    if (!elements.equiposPaginacion) return;

    if (totalPaginas <= 1) {
        elements.equiposPaginacion.innerHTML = '';
        return;
    }

    elements.equiposPaginacion.innerHTML = `
        <button
            type="button"
            class="btn-secondary"
            data-pagina-equipos="anterior"
            ${state.paginaActualEquipos === 1 ? 'disabled' : ''}
        >
            Anterior
        </button>

        <span class="paginacion-texto">
            Página ${state.paginaActualEquipos} de ${totalPaginas}
        </span>

        <button
            type="button"
            class="btn-secondary"
            data-pagina-equipos="siguiente"
            ${state.paginaActualEquipos === totalPaginas ? 'disabled' : ''}
        >
            Siguiente
        </button>
    `;
}

function manejarClicTabla(event) {
    const btnIntegrantes = event.target.closest('[data-integrantes]');
    const btnEditar = event.target.closest('[data-editar]');
    const btnInactivar = event.target.closest('[data-inactivar]');
    const btnActivar = event.target.closest('[data-activar]');

    if (btnIntegrantes) {
        abrirModalIntegrantes(btnIntegrantes.dataset.integrantes);
        return;
    }

    if (btnEditar) {
        abrirModalEquipo(btnEditar.dataset.editar);
        return;
    }

    if (btnInactivar) {
        solicitarConfirmacionInactivarEquipo(btnInactivar.dataset.inactivar);
        return;
    }

    if (btnActivar) {
        activarEquipo(btnActivar.dataset.activar);
    }
}

// =======================================
// Crear / editar equipo
// =======================================

function abrirModalEquipo(idEquipo) {
    elements.equipoForm.reset();
    setEquipoFormStatus('');

    if (idEquipo) {

        const equipo = state.equipos.find(e => String(e.id_equipo) === String(idEquipo));
        if (!equipo) return;

        elements.equipoModalTitle.textContent = 'Editar equipo';
        elements.equipoId.value = equipo.id_equipo;
        elements.equipoNombre.value = equipo.nombre;
        elements.equipoDeporte.value = equipo.deporte;

    } else {

        elements.equipoModalTitle.textContent = 'Nuevo equipo';
        elements.equipoId.value = '';

    }

    abrirModal(elements.equipoModal);
}

async function guardarEquipo(event) {
    event.preventDefault();

    const idEquipo = elements.equipoId.value;

    const payload = {
        nombre: elements.equipoNombre.value.trim(),
        deporte: elements.equipoDeporte.value.trim()
    };

    if (!payload.nombre || !payload.deporte) {
        setEquipoFormStatus('Debes indicar nombre y deporte.', true);
        return;
    }

    try {
        elements.equipoGuardarBtn.disabled = true;
        setEquipoFormStatus('Guardando...');

        const response = await fetch(
            idEquipo ? `${API_URL}/api/equipos/${idEquipo}` : `${API_URL}/api/equipos`,
            {
                method: idEquipo ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo guardar el equipo.');
        }

        cerrarModal(elements.equipoModal);
        await cargarEquipos();

        if (!idEquipo && data.id_equipo) {
            abrirModalIntegrantes(data.id_equipo);
        }

    } catch (error) {
        console.error(error);
        setEquipoFormStatus(error.message || 'Ocurrió un error al guardar el equipo.', true);
    } finally {
        elements.equipoGuardarBtn.disabled = false;
    }
}

// =======================================
// Inactivar / activar equipo
// =======================================

function solicitarConfirmacionInactivarEquipo(idEquipo) {
    const equipo = state.equipos.find(e => String(e.id_equipo) === String(idEquipo));

    abrirModalConfirmacion({
        title: 'Inactivar equipo',
        message: `¿Deseas inactivar a ${equipo ? equipo.nombre : 'este equipo'}? No se eliminará, solo dejará de estar disponible.`,
        confirmText: 'Inactivar',
        onConfirm: async () => {
            await cambiarEstadoEquipo(idEquipo, 'inactivar');
        }
    });
}

async function activarEquipo(idEquipo) {
    await cambiarEstadoEquipo(idEquipo, 'activar');
}

async function cambiarEstadoEquipo(idEquipo, accion) {
    try {
        setStatus(accion === 'activar' ? 'Activando equipo...' : 'Inactivando equipo...');

        const response = await fetch(`${API_URL}/api/equipos/${idEquipo}/${accion}`, {
            method: 'PUT',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo actualizar el equipo.');
        }

        await cargarEquipos();

    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al actualizar el equipo.', true);
    }
}

// =======================================
// Modal de integrantes
// =======================================

async function abrirModalIntegrantes(idEquipo) {
    state.equipoIdActivo = idEquipo;

    elements.integranteCuenta.value = '';
    elements.integranteRol.value = 'jugador';
    elements.integranteEstudiantePreview.textContent = '';
    setIntegranteFormStatus('');

    abrirModal(elements.integrantesModal);
    await recargarDetalleEquipo();
}

async function recargarDetalleEquipo() {
    if (!state.equipoIdActivo) return;

    try {
        elements.integrantesList.innerHTML = '<p class="empty-state">Cargando integrantes...</p>';

        const response = await fetch(`${API_URL}/api/equipos/${state.equipoIdActivo}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cargar el equipo.');
        }

        elements.integrantesModalTitle.textContent = `Integrantes — ${data.equipo.nombre}`;
        renderIntegrantes(data.equipo.integrantes || []);

        // Refresca también la fila de la tabla principal sin recargar todo
        const idx = state.equipos.findIndex(e => String(e.id_equipo) === String(state.equipoIdActivo));
        if (idx !== -1) {
            state.equipos[idx] = { ...state.equipos[idx], ...data.equipo };
            renderEquipos();
        }

    } catch (error) {
        console.error(error);
        elements.integrantesList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'Ocurrió un error al cargar los integrantes.')}</p>`;
    }
}

function renderIntegrantes(integrantes) {
    if (!integrantes.length) {
        elements.integrantesList.innerHTML = '<p class="empty-state">Este equipo todavía no tiene integrantes.</p>';
        return;
    }

    elements.integrantesList.innerHTML = integrantes.map(i => `
        <div class="integrante-item">
            <div class="integrante-info">
                <span class="integrante-nombre">${escapeHtml(i.estudiante_nombre)}</span>
                <span class="integrante-cuenta">Cuenta: ${escapeHtml(i.estudiante_cuenta)}</span>
            </div>

            <span class="chip ${i.rol}">${i.rol}</span>
            <span class="chip ${i.activo ? 'activo' : 'inactivo'}">${i.activo ? 'Activo' : 'Inactivo'}</span>

            <div class="integrante-acciones">
                ${i.activo && i.rol !== 'lider'
                    ? `<button type="button" class="action-btn" data-hacer-lider="${i.id}">Hacer líder</button>`
                    : ''
                }

                ${i.activo && i.rol === 'jugador'
                    ? `<button type="button" class="action-btn secundario" data-cambiar-rol="${i.id}" data-nuevo-rol="sublider">A sublíder</button>`
                    : ''
                }

                ${i.activo && i.rol === 'sublider'
                    ? `<button type="button" class="action-btn secundario" data-cambiar-rol="${i.id}" data-nuevo-rol="jugador">A jugador</button>`
                    : ''
                }

                ${i.activo
                    ? `<button type="button" class="action-btn secundario" data-inactivar-integrante="${i.id}">Inactivar</button>`
                    : ''
                }
            </div>
        </div>
    `).join('');

    elements.integrantesList.querySelectorAll('[data-hacer-lider]').forEach(btn => {
        btn.addEventListener('click', () => hacerLider(btn.dataset.hacerLider));
    });

    elements.integrantesList.querySelectorAll('[data-cambiar-rol]').forEach(btn => {
        btn.addEventListener('click', () => cambiarRolIntegrante(btn.dataset.cambiarRol, btn.dataset.nuevoRol));
    });

    elements.integrantesList.querySelectorAll('[data-inactivar-integrante]').forEach(btn => {
        btn.addEventListener('click', () => solicitarConfirmacionInactivarIntegrante(btn.dataset.inactivarIntegrante));
    });
}

// =======================================
// Buscar estudiante por cuenta (autocompletar nombre)
// =======================================

function manejarInputCuenta() {
    clearTimeout(state.buscaCuentaTimeout);

    const cuenta = elements.integranteCuenta.value.trim();
    elements.integranteEstudiantePreview.textContent = '';

    if (!cuenta) return;

    state.buscaCuentaTimeout = setTimeout(async () => {

        try {
            const response = await fetch(`${API_URL}/api/equipos/estudiantes/estado?cuenta=${encodeURIComponent(cuenta)}`, {
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                elements.integranteEstudiantePreview.textContent = data.mensaje || 'No se encontró un estudiante activo con esa cuenta.';
                return;
            }

            elements.integranteEstudiantePreview.textContent = `✓ ${data.estudiante.nombre}`;

        } catch (error) {
            console.error(error);
        }

    }, 400);
}

async function agregarIntegrante() {
    const cuenta = elements.integranteCuenta.value.trim();
    const rol = elements.integranteRol.value;

    if (!cuenta) {
        setIntegranteFormStatus('Debes indicar el número de cuenta.', true);
        return;
    }

    try {
        elements.btnAgregarIntegrante.disabled = true;
        setIntegranteFormStatus('Agregando...');

        const response = await fetch(`${API_URL}/api/equipos/${state.equipoIdActivo}/integrantes`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuenta, rol })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo agregar al integrante.');
        }

        elements.integranteCuenta.value = '';
        elements.integranteEstudiantePreview.textContent = '';
        setIntegranteFormStatus('');

        await recargarDetalleEquipo();

    } catch (error) {
        console.error(error);
        setIntegranteFormStatus(error.message || 'Ocurrió un error al agregar al integrante.', true);
    } finally {
        elements.btnAgregarIntegrante.disabled = false;
    }
}

async function hacerLider(idIntegrante) {
    try {
        const response = await fetch(`${API_URL}/api/equipos/${state.equipoIdActivo}/lider/${idIntegrante}`, {
            method: 'PUT',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cambiar el líder.');
        }

        await recargarDetalleEquipo();

    } catch (error) {
        console.error(error);
        setIntegranteFormStatus(error.message || 'Ocurrió un error al cambiar el líder.', true);
    }
}

async function cambiarRolIntegrante(idIntegrante, nuevoRol) {
    try {
        const response = await fetch(`${API_URL}/api/equipos/${state.equipoIdActivo}/integrantes/${idIntegrante}/rol`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rol: nuevoRol })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cambiar el rol.');
        }

        await recargarDetalleEquipo();

    } catch (error) {
        console.error(error);
        setIntegranteFormStatus(error.message || 'Ocurrió un error al cambiar el rol.', true);
    }
}

function solicitarConfirmacionInactivarIntegrante(idIntegrante) {
    abrirModalConfirmacion({
        title: 'Inactivar integrante',
        message: '¿Deseas inactivar a este integrante del equipo?',
        confirmText: 'Inactivar',
        onConfirm: async () => {
            await inactivarIntegrante(idIntegrante);
        }
    });
}

async function inactivarIntegrante(idIntegrante) {
    try {
        const response = await fetch(`${API_URL}/api/equipos/${state.equipoIdActivo}/integrantes/${idIntegrante}/inactivar`, {
            method: 'PUT',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo inactivar al integrante.');
        }

        await recargarDetalleEquipo();

    } catch (error) {
        console.error(error);
        setIntegranteFormStatus(error.message || 'Ocurrió un error al inactivar al integrante.', true);
    }
}

// =======================================
// CLUBES
// =======================================

function setStatusClub(message, isError = false) {
    if (!elements.statusMessageClub) return;
    elements.statusMessageClub.textContent = message;
    elements.statusMessageClub.classList.toggle('error', isError);
}

function setClubFormStatus(message, isError = false) {
    if (!elements.clubFormStatus) return;
    elements.clubFormStatus.textContent = message;
    elements.clubFormStatus.classList.toggle('error', isError);
}

function setClubIntegranteFormStatus(message, isError = false) {
    if (!elements.clubIntegranteFormStatus) return;
    elements.clubIntegranteFormStatus.textContent = message;
    elements.clubIntegranteFormStatus.classList.toggle('error', isError);
}

async function cargarClubes() {
    try {
        setStatusClub('Cargando clubes...');

        const params = new URLSearchParams();

        if (elements.incluirInactivosClubCheck?.checked) {
            params.set('incluir_inactivos', 'true');
        }

        const response = await fetch(`${API_URL}/api/clubes?${params.toString()}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudieron cargar los clubes');
        }

        state.clubes = data.clubes || [];
        state.paginaActualClubes = 1;

        setStatusClub(`${state.clubes.length} club(es) registrados.`);
        renderClubes();

    } catch (error) {
        console.error(error);
        setStatusClub(error.message || 'Ocurrió un error al cargar los clubes.', true);
    }
}

function renderClubes() {
    if (!elements.clubTableBody) return;

    if (!state.clubes.length) {
        elements.clubTableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay clubes registrados.</td></tr>';

        if (elements.clubesPaginacion) {
            elements.clubesPaginacion.innerHTML = '';
        }

        return;
    }

    const totalPaginas = Math.max(
        1,
        Math.ceil(state.clubes.length / CLUBES_POR_PAGINA)
    );

    state.paginaActualClubes = Math.min(
        state.paginaActualClubes,
        totalPaginas
    );

    const inicio = (state.paginaActualClubes - 1) * CLUBES_POR_PAGINA;

    const clubesDeLaPagina = state.clubes.slice(
        inicio,
        inicio + CLUBES_POR_PAGINA
    );

    elements.clubTableBody.innerHTML = clubesDeLaPagina.map((club) => {

        const integrantesActivos = (club.integrantes || []).filter(i => i.activo).length;

        return `
            <tr class="${club.activo ? '' : 'inactivo'}">
                <td>${escapeHtml(club.nombre)}</td>
                <td><span class="integrantes-count">${integrantesActivos} activo(s)</span></td>
                <td><span class="chip ${club.activo ? 'activo' : 'inactivo'}">${club.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div class="acciones-celda">
                        <button type="button" class="action-btn" data-club-integrantes="${club.id_club}">Integrantes</button>
                        <button type="button" class="action-btn secundario" data-club-editar="${club.id_club}">Editar</button>
                        ${club.activo
                            ? `<button type="button" class="action-btn secundario" data-club-inactivar="${club.id_club}">Inactivar</button>`
                            : `<button type="button" class="action-btn exito" data-club-activar="${club.id_club}">Activar</button>`
                        }
                    </div>
                </td>
            </tr>
        `;

    }).join('');

    renderPaginacionClubes(totalPaginas);
}

function renderPaginacionClubes(totalPaginas) {
    if (!elements.clubesPaginacion) return;

    if (totalPaginas <= 1) {
        elements.clubesPaginacion.innerHTML = '';
        return;
    }

    elements.clubesPaginacion.innerHTML = `
        <button
            type="button"
            class="btn-secondary"
            data-pagina-clubes="anterior"
            ${state.paginaActualClubes === 1 ? 'disabled' : ''}
        >
            Anterior
        </button>

        <span class="paginacion-texto">
            Página ${state.paginaActualClubes} de ${totalPaginas}
        </span>

        <button
            type="button"
            class="btn-secondary"
            data-pagina-clubes="siguiente"
            ${state.paginaActualClubes === totalPaginas ? 'disabled' : ''}
        >
            Siguiente
        </button>
    `;
}

function manejarClicTablaClub(event) {
    const btnIntegrantes = event.target.closest('[data-club-integrantes]');
    const btnEditar = event.target.closest('[data-club-editar]');
    const btnInactivar = event.target.closest('[data-club-inactivar]');
    const btnActivar = event.target.closest('[data-club-activar]');

    if (btnIntegrantes) {
        abrirModalIntegrantesClub(btnIntegrantes.dataset.clubIntegrantes);
        return;
    }

    if (btnEditar) {
        abrirModalClub(btnEditar.dataset.clubEditar);
        return;
    }

    if (btnInactivar) {
        solicitarConfirmacionInactivarClub(btnInactivar.dataset.clubInactivar);
        return;
    }

    if (btnActivar) {
        activarClub(btnActivar.dataset.clubActivar);
    }
}

// =======================================
// Crear / editar club
// =======================================

function abrirModalClub(idClub) {
    elements.clubForm.reset();
    setClubFormStatus('');

    if (idClub) {

        const club = state.clubes.find(c => String(c.id_club) === String(idClub));
        if (!club) return;

        elements.clubModalTitle.textContent = 'Editar club';
        elements.clubId.value = club.id_club;
        elements.clubNombre.value = club.nombre;

    } else {

        elements.clubModalTitle.textContent = 'Nuevo club';
        elements.clubId.value = '';

    }

    abrirModal(elements.clubModal);
}

async function guardarClub(event) {
    event.preventDefault();

    const idClub = elements.clubId.value;

    const payload = {
        nombre: elements.clubNombre.value.trim()
    };

    if (!payload.nombre) {
        setClubFormStatus('Debes indicar el nombre del club.', true);
        return;
    }

    try {
        elements.clubGuardarBtn.disabled = true;
        setClubFormStatus('Guardando...');

        const response = await fetch(
            idClub ? `${API_URL}/api/clubes/${idClub}` : `${API_URL}/api/clubes`,
            {
                method: idClub ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo guardar el club.');
        }

        cerrarModal(elements.clubModal);
        await cargarClubes();

        if (!idClub && data.id_club) {
            abrirModalIntegrantesClub(data.id_club);
        }

    } catch (error) {
        console.error(error);
        setClubFormStatus(error.message || 'Ocurrió un error al guardar el club.', true);
    } finally {
        elements.clubGuardarBtn.disabled = false;
    }
}

// =======================================
// Inactivar / activar club
// =======================================

function solicitarConfirmacionInactivarClub(idClub) {
    const club = state.clubes.find(c => String(c.id_club) === String(idClub));

    abrirModalConfirmacion({
        title: 'Inactivar club',
        message: `¿Deseas inactivar a ${club ? club.nombre : 'este club'}? No se eliminará, solo dejará de estar disponible.`,
        confirmText: 'Inactivar',
        onConfirm: async () => {
            await cambiarEstadoClub(idClub, 'inactivar');
        }
    });
}

async function activarClub(idClub) {
    await cambiarEstadoClub(idClub, 'activar');
}

async function cambiarEstadoClub(idClub, accion) {
    try {
        setStatusClub(accion === 'activar' ? 'Activando club...' : 'Inactivando club...');

        const response = await fetch(`${API_URL}/api/clubes/${idClub}/${accion}`, {
            method: 'PUT',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo actualizar el club.');
        }

        await cargarClubes();

    } catch (error) {
        console.error(error);
        setStatusClub(error.message || 'Ocurrió un error al actualizar el club.', true);
    }
}

// =======================================
// Modal de integrantes de club
// =======================================

async function abrirModalIntegrantesClub(idClub) {
    state.clubIdActivo = idClub;

    elements.clubIntegranteCuenta.value = '';
    elements.clubIntegranteEstudiantePreview.textContent = '';
    setClubIntegranteFormStatus('');

    abrirModal(elements.clubIntegrantesModal);
    await recargarDetalleClub();
}

async function recargarDetalleClub() {
    if (!state.clubIdActivo) return;

    try {
        elements.clubIntegrantesList.innerHTML = '<p class="empty-state">Cargando integrantes...</p>';

        const response = await fetch(`${API_URL}/api/clubes/${state.clubIdActivo}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cargar el club.');
        }

        elements.clubIntegrantesModalTitle.textContent = `Integrantes — ${data.club.nombre}`;
        renderIntegrantesClub(data.club.integrantes || []);

        const idx = state.clubes.findIndex(c => String(c.id_club) === String(state.clubIdActivo));
        if (idx !== -1) {
            state.clubes[idx] = { ...state.clubes[idx], ...data.club };
            renderClubes();
        }

    } catch (error) {
        console.error(error);
        elements.clubIntegrantesList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'Ocurrió un error al cargar los integrantes.')}</p>`;
    }
}

function renderIntegrantesClub(integrantes) {
    if (!integrantes.length) {
        elements.clubIntegrantesList.innerHTML = '<p class="empty-state">Este club todavía no tiene integrantes.</p>';
        return;
    }

    elements.clubIntegrantesList.innerHTML = integrantes.map(i => `
        <div class="integrante-item">
            <div class="integrante-info">
                <span class="integrante-nombre">${escapeHtml(i.estudiante_nombre)}</span>
                <span class="integrante-cuenta">Cuenta: ${escapeHtml(i.estudiante_cuenta)}</span>
            </div>

            <span class="chip ${i.activo ? 'activo' : 'inactivo'}">${i.activo ? 'Activo' : 'Inactivo'}</span>

            <div class="integrante-acciones">
                ${i.activo
                    ? `<button type="button" class="action-btn secundario" data-club-inactivar-integrante="${i.id}">Inactivar</button>`
                    : ''
                }
            </div>
        </div>
    `).join('');

    elements.clubIntegrantesList.querySelectorAll('[data-club-inactivar-integrante]').forEach(btn => {
        btn.addEventListener('click', () => solicitarConfirmacionInactivarIntegranteClub(btn.dataset.clubInactivarIntegrante));
    });
}

// =======================================
// Buscar estudiante por cuenta (autocompletar nombre)
// =======================================

function manejarInputCuentaClub() {
    clearTimeout(state.buscaCuentaClubTimeout);

    const cuenta = elements.clubIntegranteCuenta.value.trim();
    elements.clubIntegranteEstudiantePreview.textContent = '';

    if (!cuenta) return;

    state.buscaCuentaClubTimeout = setTimeout(async () => {

        try {
            const response = await fetch(`${API_URL}/api/equipos/estudiantes/estado?cuenta=${encodeURIComponent(cuenta)}`, {
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                elements.clubIntegranteEstudiantePreview.textContent = data.mensaje || 'No se encontró un estudiante activo con esa cuenta.';
                return;
            }

            elements.clubIntegranteEstudiantePreview.textContent = `✓ ${data.estudiante.nombre}`;

        } catch (error) {
            console.error(error);
        }

    }, 400);
}

async function agregarIntegranteClub() {
    const cuenta = elements.clubIntegranteCuenta.value.trim();

    if (!cuenta) {
        setClubIntegranteFormStatus('Debes indicar el número de cuenta.', true);
        return;
    }

    try {
        elements.btnAgregarIntegranteClub.disabled = true;
        setClubIntegranteFormStatus('Agregando...');

        const response = await fetch(`${API_URL}/api/clubes/${state.clubIdActivo}/integrantes`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuenta })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo agregar al integrante.');
        }

        elements.clubIntegranteCuenta.value = '';
        elements.clubIntegranteEstudiantePreview.textContent = '';
        setClubIntegranteFormStatus('');

        await recargarDetalleClub();

    } catch (error) {
        console.error(error);
        setClubIntegranteFormStatus(error.message || 'Ocurrió un error al agregar al integrante.', true);
    } finally {
        elements.btnAgregarIntegranteClub.disabled = false;
    }
}

function solicitarConfirmacionInactivarIntegranteClub(idIntegrante) {
    abrirModalConfirmacion({
        title: 'Retirar integrante',
        message: '¿Deseas retirar a este integrante del club?',
        confirmText: 'Retirar',
        onConfirm: async () => {
            await inactivarIntegranteClub(idIntegrante);
        }
    });
}

async function inactivarIntegranteClub(idIntegrante) {
    try {
        const response = await fetch(`${API_URL}/api/clubes/${state.clubIdActivo}/integrantes/${idIntegrante}/inactivar`, {
            method: 'PUT',
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo retirar al integrante.');
        }

        await recargarDetalleClub();

    } catch (error) {
        console.error(error);
        setClubIntegranteFormStatus(error.message || 'Ocurrió un error al retirar al integrante.', true);
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

    elements.refreshBtn?.addEventListener('click', cargarEquipos);
    elements.incluirInactivosCheck?.addEventListener('change', cargarEquipos);
    elements.nuevoEquipoBtn?.addEventListener('click', () => abrirModalEquipo(null));
    elements.tableBody?.addEventListener('click', manejarClicTabla);

    elements.equiposPaginacion?.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-pagina-equipos]');
        if (!boton) return;

        if (boton.dataset.paginaEquipos === 'anterior') {
            state.paginaActualEquipos = Math.max(1, state.paginaActualEquipos - 1);
        } else {
            state.paginaActualEquipos += 1;
        }

        renderEquipos();
    });
    elements.equipoForm?.addEventListener('submit', guardarEquipo);

    elements.integranteCuenta?.addEventListener('input', manejarInputCuenta);
    elements.btnAgregarIntegrante?.addEventListener('click', agregarIntegrante);

    document.querySelectorAll('#equipo-modal [data-action="close-equipo"]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(elements.equipoModal));
    });

    document.querySelectorAll('#integrantes-modal [data-action="close-integrantes"]').forEach(el => {
        el.addEventListener('click', () => {
            cerrarModal(elements.integrantesModal);
            state.equipoIdActivo = null;
        });
    });

    elements.confirmModalCancelBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalCloseBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalBackdrop?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalConfirmBtn?.addEventListener('click', async () => {
        const accionConfirmada = state.confirmAction;
        cerrarModalConfirmacion();

        if (typeof accionConfirmada === 'function') {
            await accionConfirmada();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
            cerrarModalConfirmacion();
        }

        if (elements.equipoModal && !elements.equipoModal.classList.contains('hidden')) {
            cerrarModal(elements.equipoModal);
        }

        if (elements.integrantesModal && !elements.integrantesModal.classList.contains('hidden')) {
            cerrarModal(elements.integrantesModal);
            state.equipoIdActivo = null;
        }

        if (elements.clubModal && !elements.clubModal.classList.contains('hidden')) {
            cerrarModal(elements.clubModal);
        }

        if (elements.clubIntegrantesModal && !elements.clubIntegrantesModal.classList.contains('hidden')) {
            cerrarModal(elements.clubIntegrantesModal);
            state.clubIdActivo = null;
        }
    });

    // =======================================
    // Listeners de Clubes
    // =======================================

    elements.refreshClubBtn?.addEventListener('click', cargarClubes);
    elements.incluirInactivosClubCheck?.addEventListener('change', cargarClubes);
    elements.nuevoClubBtn?.addEventListener('click', () => abrirModalClub(null));
    elements.clubTableBody?.addEventListener('click', manejarClicTablaClub);
    elements.clubForm?.addEventListener('submit', guardarClub);

    elements.clubIntegranteCuenta?.addEventListener('input', manejarInputCuentaClub);
    elements.btnAgregarIntegranteClub?.addEventListener('click', agregarIntegranteClub);

    elements.clubesPaginacion?.addEventListener('click', (event) => {
        const boton = event.target.closest('[data-pagina-clubes]');
        if (!boton) return;

        if (boton.dataset.paginaClubes === 'anterior') {
            state.paginaActualClubes = Math.max(1, state.paginaActualClubes - 1);
        } else {
            state.paginaActualClubes += 1;
        }

        renderClubes();
    });

    document.querySelectorAll('#club-modal [data-action="close-club"]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(elements.clubModal));
    });

    document.querySelectorAll('#club-integrantes-modal [data-action="close-club-integrantes"]').forEach(el => {
        el.addEventListener('click', () => {
            cerrarModal(elements.clubIntegrantesModal);
            state.clubIdActivo = null;
        });
    });

    await cargarEquipos();
    await cargarClubes();
});