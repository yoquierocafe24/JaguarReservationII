// reportes.js — Panel de administración · Módulo de Reportes
const API_URL = 'http://localhost:3000';

// ============================================================
// Utilidades de shell (topbar, sesión, menú) — mismo patrón
// que el resto del panel administrativo.
// ============================================================
function updateDateTime() {
    const el = document.getElementById('topbar-date');
    if (!el) return;

    const now = new Date();
    const fecha = now.toLocaleDateString('es-HN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const hora = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
    el.textContent = `${fecha.charAt(0).toUpperCase() + fecha.slice(1)} · ${hora}`;
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
        const nombreEl = document.getElementById('admin-name');
        const avatarEl = document.getElementById('admin-avatar');
        if (nombreEl) nombreEl.textContent = nombre;
        if (avatarEl) avatarEl.textContent = obtenerIniciales(nombre);
        return true;
    } catch (error) {
        console.error('Error cargando sesión del administrador:', error);
        setStatus('No se pudo verificar la sesión.', true);
        return false;
    }
}

function logout() {
    sessionStorage.clear();
    localStorage.removeItem('token');
    window.location.href = '../../login.html';
}

function abrirMenu() {
    document.querySelector('.sidebar-admin')?.classList.add('activo');
    document.getElementById('sidebar-overlay')?.classList.add('activo');
}
function cerrarMenu() {
    document.querySelector('.sidebar-admin')?.classList.remove('activo');
    document.getElementById('sidebar-overlay')?.classList.remove('activo');
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setStatus(message, isError = false) {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#b91c1c' : '#6b7280';
}

// ============================================================
// Estado
// ============================================================
const els = {
    periodo: document.getElementById('filtro-periodo'),
    carrera: document.getElementById('filtro-carrera'),
    espacio: document.getElementById('filtro-espacio'),
    ingreso: document.getElementById('filtro-ingreso'),
    refreshBtn: document.getElementById('refresh-btn'),
    exportBtn: document.getElementById('export-btn'),
    chartCarrera: document.getElementById('chart-carrera'),
    chartEspacio: document.getElementById('chart-espacio'),
    chartIngreso: document.getElementById('chart-ingreso'),
    chartEquipos: document.getElementById('chart-equipos'),
    kpiTotal: document.getElementById('kpi-total'),
    kpiCarrera: document.getElementById('kpi-carrera'),
    kpiCarreraHint: document.getElementById('kpi-carrera-hint'),
    kpiEspacio: document.getElementById('kpi-espacio'),
    kpiEspacioHint: document.getElementById('kpi-espacio-hint'),
    kpiEquipos: document.getElementById('kpi-equipos'),
    kpiEquiposHint: document.getElementById('kpi-equipos-hint')
};

const state = {
    ultimoResumen: null,
    etiquetaPeriodo: 'Todo el histórico'
};

// ============================================================
// Construcción de los parámetros de filtro para el backend
// ============================================================
function construirQuery() {
    const params = new URLSearchParams();

    // Periodo: el value puede ser '', 'anual:2026' o 'periodo:2'
    const per = els.periodo.value;
    if (per.startsWith('anual:')) {
        params.set('periodo', 'anual');
        params.set('anio', per.split(':')[1]);
    } else if (per.startsWith('periodo:')) {
        params.set('id_periodo', per.split(':')[1]);
    }

    if (els.carrera.value) params.set('carrera', els.carrera.value);
    if (els.espacio.value) params.set('id_espacio', els.espacio.value);
    if (els.ingreso.value) params.set('primer_ingreso', els.ingreso.value);

    return params;
}

// ============================================================
// Cargar opciones de los filtros
// ============================================================
async function cargarOpciones() {
    try {
        const res = await fetch(`${API_URL}/api/reportes/opciones`, { credentials: 'include' });
        const data = await res.json();
        if (!data.ok) throw new Error('Respuesta no válida');

        // Carreras
        for (const c of data.carreras) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            els.carrera.appendChild(opt);
        }

        // Espacios
        for (const e of data.espacios) {
            const opt = document.createElement('option');
            opt.value = e.id_espacio;
            opt.textContent = e.nombre;
            els.espacio.appendChild(opt);
        }

        // Periodos: anual por cada año + trimestral por cada periodo académico
        for (const anio of data.anios) {
            const opt = document.createElement('option');
            opt.value = `anual:${anio}`;
            opt.textContent = `Anual ${anio}`;
            els.periodo.appendChild(opt);
        }
        for (const p of data.periodos) {
            const opt = document.createElement('option');
            opt.value = `periodo:${p.id_periodo}`;
            opt.textContent = `Trimestral · ${p.nombre}`;
            els.periodo.appendChild(opt);
        }
    } catch (error) {
        console.error('Error cargando opciones de filtros:', error);
    }
}

// ============================================================
// Render de gráficos de barras
// ============================================================
function renderBarras(contenedor, filas, campoLabel, campoValor) {
    if (!filas || filas.length === 0) {
        contenedor.innerHTML = '<div class="card-empty">Sin reservas para los filtros seleccionados.</div>';
        return;
    }

    const max = Math.max(...filas.map(f => Number(f[campoValor]) || 0), 1);

    contenedor.innerHTML = filas.map(f => {
        const label = escapeHtml(f[campoLabel] ?? '—');
        const valor = Number(f[campoValor]) || 0;
        const pct = Math.round((valor / max) * 100);
        return `
            <div class="bar-row">
                <span class="bar-label" title="${label}">${label}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
                <span class="bar-value">${valor}</span>
            </div>`;
    }).join('');
}

function renderComparativo(contenedor, filas) {
    const primer = filas.find(f => f.categoria === 'Primer ingreso');
    const rein = filas.find(f => f.categoria === 'Reingreso');
    const sin = filas.find(f => f.categoria === 'Sin definir');

    const vPrimer = primer ? Number(primer.total_reservas) : 0;
    const vRein = rein ? Number(rein.total_reservas) : 0;
    const vSin = sin ? Number(sin.total_reservas) : 0;
    const total = vPrimer + vRein + vSin;

    if (total === 0) {
        contenedor.innerHTML = '<div class="card-empty" style="grid-column:1/-1;">Sin reservas para los filtros seleccionados.</div>';
        return;
    }

    const pct = v => total ? Math.round((v / total) * 100) : 0;

    contenedor.innerHTML = `
        <div class="compare-box">
            <div class="c-value">${vPrimer}</div>
            <div class="c-label">Primer ingreso</div>
            <div class="c-pct">${pct(vPrimer)}% del total</div>
        </div>
        <div class="compare-box reingreso">
            <div class="c-value">${vRein}</div>
            <div class="c-label">Reingreso</div>
            <div class="c-pct">${pct(vRein)}% del total</div>
        </div>
        ${vSin > 0 ? `
        <div class="compare-box" style="grid-column:1/-1;border-color:#e5e7eb;background:#f8fafc;">
            <div class="c-value" style="color:#6b7280;">${vSin}</div>
            <div class="c-label">Sin tipo de ingreso definido</div>
            <div class="c-pct">${pct(vSin)}% del total</div>
        </div>` : ''}
    `;
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs(resumen) {
    const carrera = resumen.reservas_por_carrera || [];
    const espacio = resumen.reservas_por_espacio || [];
    const equipos = resumen.integrantes_por_equipo || [];

    const totalReservas = carrera.reduce((s, f) => s + Number(f.total_reservas || 0), 0);
    els.kpiTotal.textContent = totalReservas;

    if (carrera.length) {
        els.kpiCarrera.textContent = carrera[0].carrera;
        els.kpiCarreraHint.textContent = `${carrera[0].total_reservas} reservas`;
    } else {
        els.kpiCarrera.textContent = '—';
        els.kpiCarreraHint.textContent = 'Sin datos';
    }

    if (espacio.length) {
        els.kpiEspacio.textContent = espacio[0].espacio;
        els.kpiEspacioHint.textContent = `${espacio[0].total_reservas} reservas`;
    } else {
        els.kpiEspacio.textContent = '—';
        els.kpiEspacioHint.textContent = 'Sin datos';
    }

    const totalIntegrantes = equipos.reduce((s, f) => s + Number(f.cantidad_integrantes || 0), 0);
    els.kpiEquipos.textContent = equipos.length;
    els.kpiEquiposHint.textContent = `Integrantes totales: ${totalIntegrantes}`;
}

// ============================================================
// Carga principal
// ============================================================
async function cargarReportes() {
    setStatus('Cargando reportes...');
    const params = construirQuery();

    // Etiqueta legible del periodo (para exportar y para el estado)
    const perSel = els.periodo.selectedOptions[0];
    state.etiquetaPeriodo = perSel ? perSel.textContent : 'Todo el histórico';

    try {
        const res = await fetch(`${API_URL}/api/reportes/resumen?${params.toString()}`, {
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.ok) throw new Error('Respuesta no válida');

        const r = data.datos;
        state.ultimoResumen = r;

        renderKPIs(r);
        renderBarras(els.chartCarrera, r.reservas_por_carrera, 'carrera', 'total_reservas');
        renderBarras(els.chartEspacio, r.reservas_por_espacio, 'espacio', 'total_reservas');
        renderComparativo(els.chartIngreso, r.comparativo_primer_ingreso || []);
        renderBarras(els.chartEquipos, r.integrantes_por_equipo, 'equipo', 'cantidad_integrantes');

        setStatus(`Reportes actualizados · ${state.etiquetaPeriodo} · ${new Date().toLocaleTimeString('es-HN')}`);
    } catch (error) {
        console.error('Error cargando reportes:', error);
        setStatus('No se pudieron cargar los reportes. Revisa que el servidor esté activo.', true);
    }
}

// ============================================================
// Exportar a CSV (se genera en el navegador)
// ============================================================
function exportarCSV() {
    const r = state.ultimoResumen;
    if (!r) return;

    const lineas = [];
    lineas.push(`Reportes Jaguar Reservation`);
    lineas.push(`Periodo,${state.etiquetaPeriodo}`);
    lineas.push(`Generado,${new Date().toLocaleString('es-HN')}`);
    lineas.push('');

    lineas.push('Reservas por carrera');
    lineas.push('Carrera,Total reservas');
    (r.reservas_por_carrera || []).forEach(f => lineas.push(`${csv(f.carrera)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Reservas por espacio');
    lineas.push('Espacio,Total reservas');
    (r.reservas_por_espacio || []).forEach(f => lineas.push(`${csv(f.espacio)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Primer ingreso vs reingreso');
    lineas.push('Categoria,Total reservas');
    (r.comparativo_primer_ingreso || []).forEach(f => lineas.push(`${csv(f.categoria)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Integrantes por equipo/club');
    lineas.push('Equipo,Deporte,Integrantes');
    (r.integrantes_por_equipo || []).forEach(f =>
        lineas.push(`${csv(f.equipo)},${csv(f.deporte)},${f.cantidad_integrantes}`));

    // BOM para que Excel respete acentos
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reportes_jaguar_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function csv(valor = '') {
    const v = String(valor ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ============================================================
// Inicio
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    updateDateTime();
    setInterval(updateDateTime, 30000);

    const ok = await cargarSesionAdmin();
    if (!ok) return;

    await cargarOpciones();
    await cargarReportes();

    [els.periodo, els.carrera, els.espacio, els.ingreso].forEach(sel =>
        sel.addEventListener('change', cargarReportes));

    els.refreshBtn.addEventListener('click', cargarReportes);
    els.exportBtn.addEventListener('click', exportarCSV);
});
