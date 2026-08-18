const API_URL =
    "https://jaguarreservationii-production.up.railway.app";

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
   
        sessionStorage.clear();
        localStorage.removeItem('token');
        window.location.href = '../../login.html';
    
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
    total: document.getElementById('stat-total'),
    activos: document.getElementById('stat-activos'),
    inactivos: document.getElementById('stat-inactivos'),
    tableBody: document.getElementById('students-table-body'),
    statusMessage: document.getElementById('status-message'),
    uploadForm: document.getElementById('upload-form'),
    refreshBtn: document.getElementById('refresh-btn'),
    closeTrimesterBtn: document.getElementById('close-trimester-btn'),
    periodoFilter: document.getElementById('periodo-filter'),
    estadoFilter: document.getElementById('estado-filter'),
    searchInput: document.getElementById('student-search'),
    paginationControls: document.getElementById('pagination-controls'),
    paginationInfo: document.getElementById('pagination-info'),
    paginationPage: document.getElementById('pagination-page'),
    paginationPrevBtn: document.getElementById('pagination-prev'),
    paginationNextBtn: document.getElementById('pagination-next'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmModalMessage: document.getElementById('confirm-modal-message'),
    confirmModalTitle: document.getElementById('confirm-modal-title'),
    confirmModalConfirmBtn: document.querySelector('#confirm-modal [data-action="confirm"]'),
    confirmModalCancelBtn: document.querySelector('#confirm-modal [data-action="cancel"]'),
    confirmModalCloseBtn: document.querySelector('#confirm-modal .modal-close-btn'),
    confirmModalBackdrop: document.querySelector('#confirm-modal .custom-modal-backdrop')
};

const state = {
    periodos: [],
    estudiantes: [],
    periodoActivo: '',
    confirmAction: null,
    currentPage: 1,
    pageSize: 5
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
    elements.statusMessage.style.color = isError ? '#b91c1c' : '#6b7280';
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

function getPeriodoSeleccionado() {
    const valor = elements.periodoFilter?.value || '';
    return valor;
}

async function cargarPeriodos() {
    try {
        const response = await fetch(`${API_URL}/estudiantes/periodos`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudieron cargar los periodos');
        }

        state.periodos = data.periodos || [];
        state.periodoActivo = data.periodoActivo || '';

        if (elements.periodoFilter) {
            elements.periodoFilter.innerHTML = `
                <option value="">Periodo actual</option>
                ${state.periodos.map((periodo) => `
                    <option value="${periodo.id_periodo}" ${String(periodo.id_periodo) === String(state.periodoActivo) ? 'selected' : ''}>
                        ${escapeHtml(periodo.nombre || `Periodo ${periodo.id_periodo}`)}
                    </option>
                `).join('')}
            `;

            if (!elements.periodoFilter.value) {
                elements.periodoFilter.value = state.periodoActivo || '';
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function loadDashboard() {
    try {
        setStatus('Cargando estadística de estudiantes...');
        const periodoSeleccionado = getPeriodoSeleccionado();

        const [resumenRes, estudiantesRes] = await Promise.all([
            fetch(`${API_URL}/estudiantes/resumen${periodoSeleccionado ? `?id_periodo=${encodeURIComponent(periodoSeleccionado)}` : ''}`),
            fetch(`${API_URL}/estudiantes${periodoSeleccionado ? `?id_periodo=${encodeURIComponent(periodoSeleccionado)}` : ''}`)
        ]);

        if (!resumenRes.ok || !estudiantesRes.ok) {
            throw new Error('No se pudo obtener la información del servidor');
        }

        const resumen = await resumenRes.json();
        const estudiantes = await estudiantesRes.json();

        state.estudiantes = estudiantes.estudiantes || [];
        renderStats(resumen);
        aplicarFiltros();
        setStatus(`Última actualización: ${new Date().toLocaleString()}`);
    } catch (error) {
        console.error(error);
        setStatus('No fue posible cargar los datos. Asegúrate de que el backend esté corriendo.', true);
    }
}

function esActivo(estudiante) {
    const valor = estudiante?.activo;

    if (valor === true || valor === 1 || valor === '1' || valor === 'true') {
        return true;
    }

    if (valor === false || valor === 0 || valor === '0' || valor === 'false') {
        return false;
    }

    return Boolean(valor);
}

function resetearPaginacion() {
    state.currentPage = 1;
}

//Nueva funcion
function calcularTotalPaginas(totalItems) {
    return Math.max(
        1,
        Math.ceil(totalItems / state.pageSize)
    );
}

function renderPagination(totalItems) {
    if (!elements.paginationControls || !elements.paginationInfo || !elements.paginationPage) return;

    const totalPages = calcularTotalPaginas(totalItems);
    const startIndex = totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const endIndex = totalItems === 0 ? 0 : Math.min(state.currentPage * state.pageSize, totalItems);

    if (totalItems <= state.pageSize) {
        elements.paginationControls.hidden = true;
        return;
    }

    elements.paginationControls.hidden = false;
    elements.paginationInfo.textContent = `Mostrando ${startIndex}-${endIndex} de ${totalItems} estudiantes`;
    elements.paginationPage.textContent = `Página ${state.currentPage} de ${totalPages}`;

    if (elements.paginationPrevBtn) {
        elements.paginationPrevBtn.disabled = state.currentPage <= 1;
    }

    if (elements.paginationNextBtn) {
        elements.paginationNextBtn.disabled = state.currentPage >= totalPages;
    }
}

function obtenerEstudiantesFiltrados() {
    const textoBusqueda = (elements.searchInput?.value || '').trim().toLowerCase();
    const estadoFiltro = (elements.estadoFilter?.value || '').toLowerCase();

    return state.estudiantes.filter((estudiante) => {
        const nombre = String(estudiante.nombre || '').toLowerCase();
        const cuenta = String(estudiante.cuenta || '').toLowerCase();
        const activo = esActivo(estudiante) ? 'activo' : 'inactivo';

        const coincideBusqueda = !textoBusqueda || nombre.includes(textoBusqueda) || cuenta.includes(textoBusqueda);
        const coincideEstado = !estadoFiltro || activo === estadoFiltro;

        return coincideBusqueda && coincideEstado;
    });
}

function aplicarFiltros(resetPage = true) {
    const estudiantesFiltrados = obtenerEstudiantesFiltrados();

    if (resetPage) {
        resetearPaginacion();
    }

    renderStudents(estudiantesFiltrados);
}

function renderStats(resumen) {
    if (!resumen) return;

    elements.total.textContent = resumen.total ?? 0;
    elements.activos.textContent = resumen.activos ?? 0;
    elements.inactivos.textContent = resumen.inactivos ?? 0;
}

function renderStudents(estudiantes) {
    if (!elements.tableBody) return;

    const totalItems = Array.isArray(estudiantes) ? estudiantes.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));

    if (state.currentPage > totalPages) {
        state.currentPage = totalPages;
    }

    const startIndex = totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize;
    const estudiantesPagina = totalItems === 0 ? [] : estudiantes.slice(startIndex, startIndex + state.pageSize);

    if (!estudiantesPagina.length) {
        elements.tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay estudiantes que coincidan con los filtros seleccionados.</td></tr>';
        renderPagination(0);
        return;
    }

    elements.tableBody.innerHTML = estudiantesPagina.map((estudiante) => {
        const activo = esActivo(estudiante);
        const estado = activo ? 'Activo' : 'Inactivo';
        const badgeClass = activo ? 'active' : 'inactive';
        const accionHtml = `
        <button
        type="button"
        class="action-btn ${activo ? '' : 'activar'}"
        data-id="${escapeHtml(String(estudiante.id_estudiante))}"
        data-activo="${activo ? '1' : '0'}"
    >
        ${activo ? 'Inactivar' : 'Activar'}
    </button>
`;

        return `
            <tr>
                <td>${escapeHtml(estudiante.nombre || 'Sin nombre')}</td>
                <td>${escapeHtml(estudiante.cuenta || '—')}</td>
                <td>${escapeHtml(estudiante.carrera || '—')}</td>
                <td>${escapeHtml(estudiante.correo || '—')}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(estado)}</span></td>
                <td>${accionHtml}</td>
            </tr>
        `;
    }).join('');

    renderPagination(totalItems);
}

async function cambiarEstadoEstudiante(idEstudiante, nuevoEstado) {

    try {

        const periodoSeleccionado =
            getPeriodoSeleccionado();

        setStatus(
            nuevoEstado === 1
                ? 'Activando estudiante...'
                : 'Inactivando estudiante...'
        );

        const response = await fetch(
            `${API_URL}/estudiantes/${encodeURIComponent(idEstudiante)}/estado`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    activo: nuevoEstado,
                    ...(periodoSeleccionado
                        ? { id_periodo: periodoSeleccionado }
                        : {})
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.mensaje ||
                'No se pudo actualizar el estudiante'
            );
        }

        setStatus(
            data.mensaje ||
            'Estado actualizado correctamente.'
        );

        await loadDashboard();

    } catch (error) {

        console.error(error);

        setStatus(
            error.message ||
            'Ocurrió un error al actualizar el estudiante.',
            true
        );
    }
}

function solicitarConfirmacionEstado(
    idEstudiante,
    estaActivo
) {

    const nuevoEstado =
        estaActivo ? 0 : 1;

    abrirModalConfirmacion({

        title:
            estaActivo
                ? 'Inactivar estudiante'
                : 'Activar estudiante',

        message:
            estaActivo
                ? '¿Deseas inactivar este estudiante en el periodo seleccionado? No podrá iniciar sesión hasta que vuelva a ser activado.'
                : '¿Deseas activar este estudiante? Podrá volver a iniciar sesión y utilizar el sistema.',

        confirmText:
            estaActivo
                ? 'Inactivar'
                : 'Activar',

        onConfirm: async () => {
            await cambiarEstadoEstudiante(
                idEstudiante,
                nuevoEstado
            );
        }

    });
}

function manejarClicTabla(event) {

    const boton =
        event.target.closest('.action-btn');

    if (!boton) {
        return;
    }

    const idEstudiante =
        boton.dataset.id;

    const estaActivo =
        boton.dataset.activo === '1';

    if (!idEstudiante) {
        return;
    }

    solicitarConfirmacionEstado(
        idEstudiante,
        estaActivo
    );
}
async function handleUpload(event) {
    event.preventDefault();

    const fileInput = document.getElementById('excel-file');
    if (!fileInput?.files?.length) {
        setStatus('Selecciona un archivo Excel antes de subirlo.', true);
        return;
    }

    const formData = new FormData();
    formData.append('archivo', fileInput.files[0]);

    try {
        setStatus('Subiendo archivo...');
        const response = await fetch(`${API_URL}/estudiantes/subir`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo procesar el archivo');
        }

        setStatus(`Archivo procesado correctamente. Estudiantes cargados: ${data.estudiantesProcesados || 0}`);
        fileInput.value = '';
        loadDashboard();
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al subir el archivo.', true);
    }
}

async function handleCloseTrimester() {
    try {
        setStatus('Cerrando trimestre...');
        const response = await fetch(`${API_URL}/estudiantes/cerrar-trimestre`, {
            method: 'PUT'
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cerrar el trimestre');
        }

        setStatus(data.mensaje || 'Trimestre cerrado correctamente.');
        await cargarPeriodos();

        if (data.periodo_nuevo?.id_periodo) {
            elements.periodoFilter.value = data.periodo_nuevo.id_periodo;
        }

        await loadDashboard();
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al cerrar el trimestre.', true);
    }
}

function solicitarConfirmacionCierreTrimestre() {
    abrirModalConfirmacion({
        title: 'Cerrar trimestre',
        message: '¿Deseas cerrar el trimestre actual y crear uno nuevo?',
        confirmText: 'Cerrar trimestre',
        onConfirm: async () => {
            await handleCloseTrimester();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {

     updateDateTime();
    setInterval(updateDateTime, 60000);

    const sesionValida =
        await cargarSesionAdmin();

    if (!sesionValida) {
        return;
    }

    elements.uploadForm?.addEventListener(
        'submit',
        handleUpload
    );

    elements.refreshBtn?.addEventListener(
        'click',
        async () => {
            await cargarPeriodos();
            await loadDashboard();
        }
    );

    elements.closeTrimesterBtn?.addEventListener(
        'click',
        solicitarConfirmacionCierreTrimestre
    );

    elements.periodoFilter?.addEventListener(
        'change',
        async () => {
            await loadDashboard();
        }
    );

    elements.estadoFilter?.addEventListener(
        'change',
        aplicarFiltros
    );

    elements.searchInput?.addEventListener(
        'input',
        aplicarFiltros
    );

    elements.tableBody?.addEventListener(
        'click',
        manejarClicTabla
    );

    elements.paginationPrevBtn?.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderStudents(obtenerEstudiantesFiltrados());
        }
    });

    elements.paginationNextBtn?.addEventListener('click', () => {
        const estudiantesFiltrados = obtenerEstudiantesFiltrados();
        const totalPages = calcularTotalPaginas( estudiantesFiltrados.length );
        if (state.currentPage < totalPages) {
            state.currentPage += 1;
            renderStudents(estudiantesFiltrados);
        }
    });

    elements.confirmModalCancelBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalCloseBtn?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalBackdrop?.addEventListener('click', cerrarModalConfirmacion);
    elements.confirmModalConfirmBtn?.addEventListener('click', async () => {
        const accionConfirmada = state.confirmAction;

        if (typeof accionConfirmada === 'function') {
            cerrarModalConfirmacion();
            await accionConfirmada();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
            cerrarModalConfirmacion();
        }
    });

    await cargarPeriodos();
    await loadDashboard();
});