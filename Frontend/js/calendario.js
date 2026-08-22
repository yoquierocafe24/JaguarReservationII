const API_URL =
  "https://jaguarreservationii-production.up.railway.app";


// =======================================
// Espacios de respaldo, por si /api/espacios
// no existe todavía en el backend.
// AJUSTA estos id/nombre si no coinciden
// con tu tabla Espacios.
// =======================================
const ESPACIOS_RESPALDO = [
    { id_espacio: 1, nombre: 'Fútbol' },
    { id_espacio: 2, nombre: 'Baloncesto' },
    { id_espacio: 3, nombre: 'Voleibol' },
    { id_espacio: 4, nombre: 'Zona Jaguar' }
];

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// =======================================
// Fecha/hora en la topbar
// =======================================
function updateDateTime() {
    const dateElement = document.getElementById('topbar-date');
    if (!dateElement) return;

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

    const fechaFinal = fecha.charAt(0).toUpperCase() + fecha.slice(1);

    dateElement.textContent = `${fechaFinal} · ${hora}`;
}

// =======================================
// Sesión (solo admin puede administrar el calendario)
// =======================================
async function cargarSesionAdmin() {
    try {
        const response = await fetch(`${API_URL}/api/auth/session`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok || data.usuario?.rol !== 'admin') {
            window.location.href = '../../login.html';
            return false;
        }

        const nombre = data.usuario.nombre || 'Administrador';

        const nombreElement = document.getElementById('usuario-nombre');
        const avatarElement = document.getElementById('usuario-avatar');

        if (nombreElement) nombreElement.textContent = nombre;
        if (avatarElement) avatarElement.textContent = obtenerIniciales(nombre);

        return true;

    } catch (error) {
        console.error('Error cargando sesión del administrador:', error);
        setStatus('No se pudo verificar la sesión.', true);
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

async function cerrarSesion() {
    try {
        const response = await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            window.location.href = '../../login.html';
        }

    } catch (error) {
        console.error('Error cerrando sesión:', error);
    }
}
// =======================================
// Menú responsive (sidebar / overlay)
// =======================================
function abrirMenu() {
    document.querySelector('.sidebar-admin')?.classList.add('activo');
    document.querySelector('.sidebar-overlay')?.classList.add('activo');
}

function cerrarMenu() {
    document.querySelector('.sidebar-admin')?.classList.remove('activo');
    document.querySelector('.sidebar-overlay')?.classList.remove('activo');
}

// =======================================
// Elementos y estado
// =======================================
const elements = {
    calendarStatus: document.getElementById('calendar-status'),
    mesLabel: document.getElementById('mes-actual-label'),
    mesAnterior: document.getElementById('mes-anterior'),
    mesSiguiente: document.getElementById('mes-siguiente'),
    grid: document.getElementById('calendar-grid'),
    espacioFilter: document.getElementById('espacio-filter'),
    btnNuevoBloqueo: document.getElementById('btn-nuevo-bloqueo'),

    panelDefault: document.getElementById('day-panel-default'),
    panelDetalle: document.getElementById('day-panel-detalle'),
    proximasList: document.getElementById('proximas-reservas-list'),
    diaTitulo: document.getElementById('dia-seleccionado-titulo'),
    btnCerrarDetalle: document.getElementById('btn-cerrar-detalle'),
    btnBloquearDia: document.getElementById('btn-bloquear-dia'),
    bloqueosDiaList: document.getElementById('bloqueos-dia-list'),
    reservasDiaList: document.getElementById('reservas-dia-list'),

    modalBloqueo: document.getElementById('modal-bloqueo'),
    formBloqueo: document.getElementById('form-bloqueo'),
    bloqueoFechaInicio: document.getElementById('bloqueo-fecha-inicio'),
    bloqueoFechaFin: document.getElementById('bloqueo-fecha-fin'),
    bloqueoHorasRow: document.getElementById('bloqueo-horas-row'),
    bloqueoHoraInicio: document.getElementById('bloqueo-hora-inicio'),
    bloqueoHoraFin: document.getElementById('bloqueo-hora-fin'),
    bloqueoEspacio: document.getElementById('bloqueo-espacio'),
    bloqueoMotivo: document.getElementById('bloqueo-motivo'),
    bloqueoConflicto: document.getElementById('bloqueo-conflicto'),
    bloqueoConflictoCantidad: document.getElementById('bloqueo-conflicto-cantidad'),
    bloqueoConflictoLista: document.getElementById('bloqueo-conflicto-lista'),
    bloqueoCancelarReservas: document.getElementById('bloqueo-cancelar-reservas'),
    bloqueoFormStatus: document.getElementById('bloqueo-form-status'),
    btnGuardarBloqueo: document.getElementById('btn-guardar-bloqueo'),

    modalCancelar: document.getElementById('modal-cancelar'),
    cancelarMotivo: document.getElementById('cancelar-motivo'),
    btnConfirmarCancelar: document.getElementById('btn-confirmar-cancelar'),
    modalEliminarBloqueo: document.getElementById('modal-eliminar-bloqueo'),
btnConfirmarEliminarBloqueo: document.getElementById('btn-confirmar-eliminar-bloqueo'),
};

const state = {
    mesVisible: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    diaSeleccionado: null, // 'YYYY-MM-DD'
    reservas: [],
    bloqueos: [],
    espacios: [],
    reservaIdParaCancelar: null
};

// =======================================
// Utilidades
// =======================================
function pad2(n) {
    return String(n).padStart(2, '0');
}

function toISODate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function obtenerSoloFecha(fecha) {
    if (!fecha) return '';
    return String(fecha).substring(0, 10);
}

function esFechaPasada(iso) {
    const hoy = toISODate(new Date());
    return iso < hoy;
}

function tieneBloqueoCompleto(iso) {
    return state.bloqueos.some(b => {
        const inicio = obtenerSoloFecha(b.fecha_inicio);
        const fin = obtenerSoloFecha(b.fecha_fin);

        return Number(b.dia_completo) === 1 &&
               iso >= inicio &&
               iso <= fin &&
               !b.id_espacio;
    });
}



function formatearFechaLarga(valorFecha) {

    const iso = obtenerSoloFecha(valorFecha);

    if (!iso) return '';

    const fecha = new Date(`${iso}T00:00:00`);

    const texto = fecha.toLocaleDateString('es-HN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearHora(horaSql) {
    if (!horaSql) return '';
    return horaSql.substring(0, 5);
}

function setStatus(message, isError = false) {
    if (!elements.calendarStatus) return;
    elements.calendarStatus.textContent = message;
    elements.calendarStatus.classList.toggle('error', isError);
}

function setBloqueoFormStatus(message, isError = false) {
    if (!elements.bloqueoFormStatus) return;
    elements.bloqueoFormStatus.textContent = message;
    elements.bloqueoFormStatus.classList.toggle('error', isError);
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =======================================
// Cargar espacios (para los selects de filtro)
// =======================================
async function cargarEspacios() {
    try {
        const response = await fetch(`${API_URL}/api/espacios`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('sin endpoint de espacios');

        const data = await response.json();
        state.espacios = data.espacios || data || ESPACIOS_RESPALDO;

    } catch (error) {
        state.espacios = ESPACIOS_RESPALDO;
    }

    const opciones = state.espacios.map(e =>
        `<option value="${e.id_espacio}">${escapeHtml(e.nombre)}</option>`
    ).join('');

    if (elements.espacioFilter) {
        elements.espacioFilter.innerHTML =
            `<option value="">Todos los espacios</option>${opciones}`;
    }

    if (elements.bloqueoEspacio) {
        elements.bloqueoEspacio.innerHTML =
            `<option value="">Todos los espacios</option>${opciones}`;
    }
}

// =======================================
// Cargar eventos del mes visible
// =======================================
async function cargarEventosDelMes() {
    try {
        setStatus('Cargando calendario...');

        const primerDia = new Date(state.mesVisible.getFullYear(), state.mesVisible.getMonth(), 1);
        const ultimoDia = new Date(state.mesVisible.getFullYear(), state.mesVisible.getMonth() + 1, 0);

        const params = new URLSearchParams({
            fecha_inicio: toISODate(primerDia),
            fecha_fin: toISODate(ultimoDia)
        });

        if (elements.espacioFilter?.value) {
            params.set('espacio', elements.espacioFilter.value);
        }

        const response = await fetch(`${API_URL}/api/calendario/eventos?${params.toString()}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cargar el calendario');
        }

        state.reservas = data.reservas || [];
        state.bloqueos = data.bloqueos || [];

        setStatus('');
        renderCalendario();
        renderProximasReservas();

        if (state.diaSeleccionado) {
            renderDetalleDia(state.diaSeleccionado);
        }

    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Ocurrió un error al cargar el calendario.', true);
    }
}

// =======================================
// Render del grid del mes
// =======================================
function renderCalendario() {
    if (!elements.grid) return;

    const anio = state.mesVisible.getFullYear();
    const mes = state.mesVisible.getMonth();

    elements.mesLabel.textContent = `${MESES[mes]} ${anio}`;

    const primerDiaSemana = new Date(anio, mes, 1).getDay(); // 0 = domingo
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const diasMesAnterior = new Date(anio, mes, 0).getDate();

    const hoyIso = toISODate(new Date());

    const celdas = [];

    // Días finales del mes anterior (relleno)
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
        celdas.push({ numero: diasMesAnterior - i, otroMes: true, iso: null });
    }

    // Días del mes actual
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const iso = `${anio}-${pad2(mes + 1)}-${pad2(dia)}`;
        celdas.push({ numero: dia, otroMes: false, iso });
    }

    // Relleno final hasta completar semanas de 7
    while (celdas.length % 7 !== 0) {
        celdas.push({ numero: celdas.length, otroMes: true, iso: null });
    }

    elements.grid.innerHTML = celdas.map(celda => {

        if (celda.otroMes) {
            return `<div class="calendar-day otro-mes"><span class="dia-numero">${celda.numero}</span></div>`;
        }

        const reservasDia = state.reservas.filter(r => r.fecha?.startsWith(celda.iso));
        const bloqueosDia = state.bloqueos.filter(b => {
        const inicio = obtenerSoloFecha(b.fecha_inicio);
        const fin = obtenerSoloFecha(b.fecha_fin);

     return celda.iso >= inicio && celda.iso <= fin;
    });

        const clasesExtra = [];
        if (celda.iso === hoyIso) clasesExtra.push('hoy');
        if (celda.iso === state.diaSeleccionado) clasesExtra.push('seleccionado');
        if (bloqueosDia.some(b => b.dia_completo)) clasesExtra.push('dia-bloqueado');

        const badges = [];

        if (reservasDia.length > 0) {
            badges.push(`<span class="dia-badge reservas">${reservasDia.length} reserva${reservasDia.length === 1 ? '' : 's'}</span>`);
        }

        if (bloqueosDia.length > 0) {
            badges.push(`<span class="dia-badge bloqueo">${bloqueosDia.some(b => b.dia_completo) ? 'Cerrado' : 'Horas cerradas'}</span>`);
        }

        return `
            <div class="calendar-day ${clasesExtra.join(' ')}" data-iso="${celda.iso}">
                <span class="dia-numero">${celda.numero}</span>
                <div class="dia-badges">${badges.join('')}</div>
            </div>
        `;

    }).join('');

    elements.grid.querySelectorAll('.calendar-day[data-iso]').forEach(el => {
        el.addEventListener('click', () => {
            state.diaSeleccionado = el.dataset.iso;
            renderCalendario();
            renderDetalleDia(el.dataset.iso);
        });
    });
}

// =======================================
// Panel: próximas reservas (vista por defecto)
// =======================================
function renderProximasReservas() {
    if (!elements.proximasList) return;

    const ahoraIso = toISODate(new Date());

    const proximas = state.reservas
        .filter(r => r.fecha >= ahoraIso)
        .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))
        .slice(0, 8);

    if (proximas.length === 0) {
        elements.proximasList.innerHTML = '<p class="empty-state">No hay reservas próximas en este mes.</p>';
        return;
    }

    elements.proximasList.innerHTML = proximas.map(r => `
        <div class="agenda-item">
            <div class="agenda-item-top">
                <div>
                    <div class="agenda-item-hora">${formatearHora(r.hora_inicio)} – ${formatearHora(r.hora_fin)}</div>
                    <div class="agenda-item-fecha">${formatearFechaLarga(r.fecha)}</div>
                </div>
                <span class="chip ${r.estado}">${r.estado}</span>
            </div>
            <div class="agenda-item-sub">${escapeHtml(r.espacio_nombre)} · ${escapeHtml(r.estudiante_nombre)}</div>

        </div>
    `).join('');
}

// =======================================
// Configurar estado del botón de bloqueo
// =======================================
function configurarBotonBloqueo(iso) {

    if (!elements.btnBloquearDia) return;

    const fechaPasada = esFechaPasada(iso);
    const diaBloqueadoCompleto =
        tieneBloqueoCompleto(iso);

    elements.btnBloquearDia.disabled =
        fechaPasada || diaBloqueadoCompleto;

    if (fechaPasada) {
        elements.btnBloquearDia.textContent =
            'Fecha finalizada';
        return;
    }

    if (diaBloqueadoCompleto) {
        elements.btnBloquearDia.textContent =
            'Día bloqueado';
        return;
    }

    elements.btnBloquearDia.innerHTML =
        '<i class="bi bi-lock"></i> Cerrar este día';
}

// =======================================
// Obtener bloqueos del día seleccionado
// =======================================
function obtenerBloqueosDelDia(iso) {

    return state.bloqueos.filter(b => {

        const inicio =
            obtenerSoloFecha(b.fecha_inicio);

        const fin =
            obtenerSoloFecha(b.fecha_fin);

        return iso >= inicio && iso <= fin;
    });
}

// =======================================
// Obtener reservas del día seleccionado
// =======================================
function obtenerReservasDelDia(iso) {

    return state.reservas
        .filter(r =>
            r.fecha?.startsWith(iso)
        )
        .sort((a, b) =>
            a.hora_inicio.localeCompare(
                b.hora_inicio
            )
        );
}

// =======================================
// Panel: detalle de un día
// =======================================
function renderDetalleDia(iso) {
    elements.panelDefault.hidden = true;
    elements.panelDetalle.hidden = false;
    elements.diaTitulo.textContent = formatearFechaLarga(iso);

    // Se sigue usando para ocultar acciones
    // en fechas que ya pasaron
    const fechaPasada = esFechaPasada(iso);

    // Funciones separadas

      configurarBotonBloqueo(iso);

      const bloqueosDia =
        obtenerBloqueosDelDia(iso);

     const reservasDia =
        obtenerReservasDelDia(iso);
   

    // Bloqueos del día
    if (bloqueosDia.length === 0) {
        elements.bloqueosDiaList.innerHTML = '<p class="empty-state">Sin bloqueos.</p>';
    } else {
        elements.bloqueosDiaList.innerHTML = bloqueosDia.map(b => `
            <div class="agenda-item">
                <div class="agenda-item-top">
                    <div>
                        <div class="agenda-item-hora">
                            ${b.dia_completo ? 'Día completo' : `${formatearHora(b.hora_inicio)} – ${formatearHora(b.hora_fin)}`}
                        </div>
                        <div class="agenda-item-fecha">${escapeHtml(b.espacio_nombre || 'Todos los espacios')}</div>
                    </div>
                    <span class="chip bloqueo">bloqueo</span>
                </div>
                ${b.motivo ? `<div class="agenda-item-sub">${escapeHtml(b.motivo)}</div>` : ''}
                ${
    fechaPasada
        ? ''
        : `
            <div class="agenda-item-acciones">
                <button
                    type="button"
                    class="link-btn"
                    data-eliminar-bloqueo="${b.id_bloqueo}"
                >
                    Eliminar bloqueo
                </button>
            </div>
        `
}
            </div>
        `).join('');
    }

    // Reservas del día
if (reservasDia.length === 0) {
    elements.reservasDiaList.innerHTML =
        '<p class="empty-state">Sin reservas.</p>';
} else {
    elements.reservasDiaList.innerHTML = reservasDia.map(r => `
        <div class="agenda-item">

            <div class="agenda-item-top">
                <div>
                    <div class="agenda-item-hora">
                        ${formatearHora(r.hora_inicio)} – ${formatearHora(r.hora_fin)}
                    </div>

                    <div class="agenda-item-fecha">
                        ${escapeHtml(r.espacio_nombre)}
                    </div>
                </div>

                <span class="chip ${r.estado}">
                    ${r.estado}
                </span>
            </div>

            <div class="agenda-item-sub">
                ${escapeHtml(r.estudiante_nombre)}
            </div>

            ${
                fechaPasada
                    ? ''
                    : `
                        <div class="agenda-item-acciones">
                            <button
                                type="button"
                                class="link-btn"
                                data-cancelar-reserva="${r.id_reserva}"
                            >
                                Cancelar reserva
                            </button>
                        </div>
                    `
            }

        </div>
    `).join('');
}

    elements.bloqueosDiaList.querySelectorAll('[data-eliminar-bloqueo]').forEach(btn => {
        btn.addEventListener('click', () => eliminarBloqueo(btn.dataset.eliminarBloqueo));
    });

    elements.reservasDiaList.querySelectorAll('[data-cancelar-reserva]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalCancelar(btn.dataset.cancelarReserva));
    });
}

function cerrarDetalleDia() {
    state.diaSeleccionado = null;
    elements.panelDetalle.hidden = true;
    elements.panelDefault.hidden = false;
    renderCalendario();
}

// =======================================
// Cancelar reserva
// =======================================
function abrirModalCancelar(idReserva) {
    state.reservaIdParaCancelar = idReserva;
    elements.cancelarMotivo.value = '';
     setCancelarFormStatus(''); 
    abrirModal(elements.modalCancelar);
}

async function confirmarCancelarReserva() {
    if (!state.reservaIdParaCancelar) return;

    const motivo = elements.cancelarMotivo.value.trim();

    // Validar ANTES de enviar, igual que en Reservas
    if (!motivo || motivo.length < 5) {
        setCancelarFormStatus('Debe indicar el motivo de la cancelación (mínimo 5 caracteres).', true);
        return;
    }

    try {
        elements.btnConfirmarCancelar.disabled = true;
        setCancelarFormStatus('');

        const response = await fetch(`${API_URL}/api/reservas/${state.reservaIdParaCancelar}/cancelar`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo_cancelacion: motivo })
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo cancelar la reserva.');
        }

        cerrarModal(elements.modalCancelar);
        await cargarEventosDelMes();

    } catch (error) {
        console.error(error);
        setCancelarFormStatus(error.message || 'Ocurrió un error al cancelar la reserva.', true);
    } finally {
        elements.btnConfirmarCancelar.disabled = false;
    }
}

function setCancelarFormStatus(message, isError = false) {
    const el = document.getElementById('cancelar-form-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
}

// =======================================
// Crear bloqueo
// =======================================
function abrirModalBloqueo(fechaPrellenada) {
    elements.formBloqueo.reset();

    const hoy = toISODate(new Date());

elements.bloqueoFechaInicio.min = hoy;
elements.bloqueoFechaFin.min = hoy;
    elements.bloqueoHorasRow.hidden = true;
    elements.bloqueoConflicto.hidden = true;
    elements.bloqueoCancelarReservas.checked = false;
    setBloqueoFormStatus('');

    if (fechaPrellenada) {
        elements.bloqueoFechaInicio.value = fechaPrellenada;
    }

    abrirModal(elements.modalBloqueo);
}

function actualizarVisibilidadHoras() {
    const tipo = elements.formBloqueo.querySelector('input[name="tipo-cierre"]:checked')?.value;
    elements.bloqueoHorasRow.hidden = tipo !== 'horas';
}

async function enviarFormularioBloqueo(event) {
    event.preventDefault();

    const tipo = elements.formBloqueo.querySelector('input[name="tipo-cierre"]:checked')?.value;
    const diaCompleto = tipo !== 'horas';

    const payload = {
        fecha_inicio: elements.bloqueoFechaInicio.value,
        fecha_fin: elements.bloqueoFechaFin.value || undefined,
        dia_completo: diaCompleto ? 1 : 0,
        hora_inicio: diaCompleto ? undefined : elements.bloqueoHoraInicio.value,
        hora_fin: diaCompleto ? undefined : elements.bloqueoHoraFin.value,
        id_espacio: elements.bloqueoEspacio.value || undefined,
        motivo: elements.bloqueoMotivo.value.trim() || undefined,
        cancelar_reservas: elements.bloqueoCancelarReservas.checked || undefined
    };

    if (!payload.fecha_inicio) {
        setBloqueoFormStatus('Debes indicar la fecha de inicio.', true);
        return;
    }

    if (!diaCompleto && (!payload.hora_inicio || !payload.hora_fin)) {
        setBloqueoFormStatus('Debes indicar hora de inicio y fin.', true);
        return;
    }

    try {
        elements.btnGuardarBloqueo.disabled = true;
        setBloqueoFormStatus('Guardando...');

        const response = await fetch(`${API_URL}/api/calendario/bloqueos`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // Conflicto: hay reservas en ese horario y no se pidió cancelarlas todavía
        if (response.status === 409 && data.reservasAfectadas) {
            mostrarConflicto(data.reservasAfectadas);
            setBloqueoFormStatus('Revisa las reservas afectadas antes de continuar.', true);
            return;
        }

        if (!response.ok || !data.ok) {
            throw new Error(data.mensaje || 'No se pudo crear el bloqueo.');
        }

        cerrarModal(elements.modalBloqueo);
        await cargarEventosDelMes();

    } catch (error) {
        console.error(error);
        setBloqueoFormStatus(error.message || 'Ocurrió un error al crear el bloqueo.', true);
    } finally {
        elements.btnGuardarBloqueo.disabled = false;
    }
}

function mostrarConflicto(reservasAfectadas) {
    elements.bloqueoConflicto.hidden = false;
    elements.bloqueoConflictoCantidad.textContent = reservasAfectadas.length;

    elements.bloqueoConflictoLista.innerHTML = reservasAfectadas.map(r => `
        <div class="agenda-item">
            <div class="agenda-item-top">
                <div>
                    <div class="agenda-item-hora">${formatearHora(r.hora_inicio)} – ${formatearHora(r.hora_fin)}</div>
                   <div class="agenda-item-fecha">${formatearFechaLarga(r.fecha)}</div>
                </div>
                <span class="chip ${r.estado}">${r.estado}</span>
            </div>
            <div class="agenda-item-sub">${escapeHtml(r.estudiante_nombre)}</div>
        </div>
    `).join('');
}

// =======================================
// Eliminar bloqueo
// =======================================

let bloqueoIdParaEliminar = null;

function eliminarBloqueo(idBloqueo) {
    bloqueoIdParaEliminar = idBloqueo;
    abrirModal(elements.modalEliminarBloqueo);
}


async function confirmarEliminarBloqueo() {

    if (!bloqueoIdParaEliminar) return;

    try {

        elements.btnConfirmarEliminarBloqueo.disabled = true;

        const response = await fetch(
            `${API_URL}/api/calendario/bloqueos/${bloqueoIdParaEliminar}`,
            {
                method: 'DELETE',
                credentials: 'include'
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.mensaje || 'No se pudo eliminar el bloqueo.'
            );
        }

        cerrarModal(elements.modalEliminarBloqueo);
        bloqueoIdParaEliminar = null;

        await cargarEventosDelMes();

    } catch (error) {

        console.error(
            'Error eliminando bloqueo:',
            error
        );

    } finally {

        elements.btnConfirmarEliminarBloqueo.disabled = false;
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

    const sesionValida = await cargarSesionAdmin();
    if (!sesionValida) return;

    await cargarEspacios();
    await cargarEventosDelMes();

     // Actualizar calendario automáticamente cada 30 segundos
    setInterval(cargarEventosDelMes, 30000);

    elements.mesAnterior?.addEventListener('click', () => {
        state.mesVisible = new Date(state.mesVisible.getFullYear(), state.mesVisible.getMonth() - 1, 1);
        cargarEventosDelMes();
    });

    elements.mesSiguiente?.addEventListener('click', () => {
        state.mesVisible = new Date(state.mesVisible.getFullYear(), state.mesVisible.getMonth() + 1, 1);
        cargarEventosDelMes();
    });

    elements.espacioFilter?.addEventListener('change', cargarEventosDelMes);

    elements.btnNuevoBloqueo?.addEventListener('click', () => abrirModalBloqueo(state.diaSeleccionado));
    elements.btnBloquearDia?.addEventListener('click', () => abrirModalBloqueo(state.diaSeleccionado));
    elements.btnCerrarDetalle?.addEventListener('click', cerrarDetalleDia);

    elements.formBloqueo?.addEventListener('submit', enviarFormularioBloqueo);
    elements.formBloqueo?.querySelectorAll('input[name="tipo-cierre"]').forEach(input => {
        input.addEventListener('change', actualizarVisibilidadHoras);
    });

    document.querySelectorAll('#modal-bloqueo [data-action="close"]').forEach(el => {
        el.addEventListener('click', () => cerrarModal(elements.modalBloqueo) );
    });

   document.querySelectorAll('#modal-cancelar [data-action="close-cancelar"]').forEach(el => {
    el.addEventListener('click', () => {
        cerrarModal(elements.modalCancelar);
        setCancelarFormStatus('');  
    });
});

    elements.btnConfirmarCancelar?.addEventListener('click', confirmarCancelarReserva);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!elements.modalBloqueo.classList.contains('hidden')) cerrarModal(elements.modalBloqueo);
        if (!elements.modalCancelar.classList.contains('hidden')) cerrarModal(elements.modalCancelar);
    });

    document.querySelectorAll(
    '#modal-eliminar-bloqueo [data-action="close-eliminar-bloqueo"]'
).forEach(el => {

    el.addEventListener('click', () => {
        cerrarModal(elements.modalEliminarBloqueo);
        bloqueoIdParaEliminar = null;
    });

});

elements.btnConfirmarEliminarBloqueo?.addEventListener(
    'click',
    confirmarEliminarBloqueo
);

});