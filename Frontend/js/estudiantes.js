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
    searchInput: document.getElementById('student-search')
};

const state = {
    periodos: [],
    estudiantes: [],
    periodoActivo: ''
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

function aplicarFiltros() {
    const textoBusqueda = (elements.searchInput?.value || '').trim().toLowerCase();
    const estadoFiltro = (elements.estadoFilter?.value || '').toLowerCase();

    const estudiantesFiltrados = state.estudiantes.filter((estudiante) => {
        const nombre = String(estudiante.nombre || '').toLowerCase();
        const cuenta = String(estudiante.cuenta || '').toLowerCase();
        const activo = (estudiante.activo === 1 || estudiante.activo === true) ? 'activo' : 'inactivo';

        const coincideBusqueda = !textoBusqueda || nombre.includes(textoBusqueda) || cuenta.includes(textoBusqueda);
        const coincideEstado = !estadoFiltro || activo === estadoFiltro;

        return coincideBusqueda && coincideEstado;
    });

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

    if (!estudiantes.length) {
        elements.tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay estudiantes que coincidan con los filtros seleccionados.</td></tr>';
        return;
    }

    elements.tableBody.innerHTML = estudiantes.map((estudiante) => {
        const estado = estudiante.activo === 1 || estudiante.activo === true ? 'Activo' : 'Inactivo';
        const badgeClass = estudiante.activo === 1 || estudiante.activo === true ? 'active' : 'inactive';

        return `
            <tr>
                <td>${escapeHtml(estudiante.nombre || 'Sin nombre')}</td>
                <td>${escapeHtml(estudiante.cuenta || '—')}</td>
                <td>${escapeHtml(estudiante.carrera || '—')}</td>
                <td>${escapeHtml(estudiante.correo || '—')}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(estado)}</span></td>
            </tr>
        `;
    }).join('');
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
        handleCloseTrimester
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

    await cargarPeriodos();
    await loadDashboard();
});