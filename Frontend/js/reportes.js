// reportes.js — Panel de administración · Módulo de Reportes
const API_URL =
    'https://jaguarreservationii-production.up.railway.app';

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
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    exportExcelBtn: document.getElementById('export-excel-btn'),
    chartCarrera: document.getElementById('chart-carrera'),
    chartEspacio: document.getElementById('chart-espacio'),
    chartIngreso: document.getElementById('chart-ingreso'),
    chartEquipos: document.getElementById('chart-equipos'),
    chartClubes: document.getElementById('chart-clubes'),
    kpiTotal: document.getElementById('kpi-total'),
    kpiCarrera: document.getElementById('kpi-carrera'),
    kpiCarreraHint: document.getElementById('kpi-carrera-hint'),
    kpiEspacio: document.getElementById('kpi-espacio'),
    kpiEspacioHint: document.getElementById('kpi-espacio-hint'),
    kpiEquipos: document.getElementById('kpi-equipos'),
    kpiEquiposHint: document.getElementById('kpi-equipos-hint'),
    kpiClubes: document.getElementById('kpi-clubes'),
    kpiClubesHint: document.getElementById('kpi-clubes-hint')
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
    const clubes = resumen.integrantes_por_club || [];

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

    // Equipos y Clubes combinados en un solo KPI
    const totalGrupos = equipos.length + clubes.length;

    const totalIntegrantes =
        equipos.reduce((s, f) => s + Number(f.cantidad_integrantes || 0), 0) +
        clubes.reduce((s, f) => s + Number(f.cantidad_integrantes || 0), 0);

    els.kpiEquipos.textContent = totalGrupos;
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
        renderBarras(els.chartClubes, r.integrantes_por_club, 'club', 'cantidad_integrantes');

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

    lineas.push('Integrantes por equipo');
    lineas.push('Equipo,Deporte,Integrantes');
    (r.integrantes_por_equipo || []).forEach(f =>
        lineas.push(`${csv(f.equipo)},${csv(f.deporte)},${f.cantidad_integrantes}`));
    lineas.push('');

    lineas.push('Integrantes por club');
    lineas.push('Club,Integrantes');
    (r.integrantes_por_club || []).forEach(f =>
        lineas.push(`${csv(f.club)},${f.cantidad_integrantes}`));

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
// Exportar a PDF (se genera en el navegador con jsPDF)
// ============================================================
function exportarPDF() {
    const r = state.ultimoResumen;
    if (!r) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const COLOR_CARMINE = [147, 6, 30];
    const COLOR_TEXTO = [80, 80, 80];

    let y = 18;

    // ---- Encabezado ----
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_CARMINE);
    doc.text('Reportes Jaguar Reservation', 14, y);

    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(`Periodo: ${state.etiquetaPeriodo}`, 14, y);

    y += 5;
    doc.text(`Generado: ${new Date().toLocaleString('es-HN')}`, 14, y);

    y += 8;

    // ---- Totales calculados a partir de los datos ----
    const totalReservas = (r.reservas_por_carrera || [])
        .reduce((s, f) => s + Number(f.total_reservas || 0), 0);

    const estados = r.reservas_por_estado || {};
    const asistencia = r.asistencia || { total_asistencias: 0, reservas_con_asistencia: 0 };

    // ---- Tabla: Indicadores generales ----
    doc.autoTable({
        startY: y,
        head: [['Indicador', 'Valor']],
        body: [
            ['Total de reservas', totalReservas],
            ['Reservas aprobadas', estados.aprobada || 0],
            ['Reservas pendientes', estados.pendiente || 0],
            ['Reservas canceladas', estados.cancelada || 0],
            ['Reservas rechazadas', estados.rechazada || 0],
            ['Reservas sin asistencia (nadie llegó)', r.reservas_sin_asistencia || 0],
            ['Asistencias registradas', asistencia.total_asistencias],
            ['Reservas con asistencia registrada', asistencia.reservas_con_asistencia],
            ['Estudiantes que reservaron y son integrantes de un club', r.estudiantes_en_clubes || 0]
        ],
        theme: 'grid',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Reservas por carrera ----
    doc.autoTable({
        startY: y,
        head: [['Carrera', 'Total reservas']],
        body: (r.reservas_por_carrera || []).map(f => [f.carrera, f.total_reservas]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Reservas por espacio ----
    doc.autoTable({
        startY: y,
        head: [['Espacio', 'Total reservas']],
        body: (r.reservas_por_espacio || []).map(f => [f.espacio, f.total_reservas]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Primer ingreso vs reingreso ----
    doc.autoTable({
        startY: y,
        head: [['Categoría', 'Total reservas']],
        body: (r.comparativo_primer_ingreso || []).map(f => [f.categoria, f.total_reservas]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Integrantes por equipo ----
    doc.autoTable({
        startY: y,
        head: [['Equipo', 'Deporte', 'Integrantes']],
        body: (r.integrantes_por_equipo || []).map(f => [f.equipo, f.deporte, f.cantidad_integrantes]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Integrantes por club ----
    doc.autoTable({
        startY: y,
        head: [['Club', 'Integrantes']],
        body: (r.integrantes_por_club || []).map(f => [f.club, f.cantidad_integrantes]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Juego más reservado ----
    if ((r.juego_mas_reservado || []).length) {
        doc.autoTable({
            startY: y,
            head: [['Juego (Zona Jaguar)', 'Total reservas']],
            body: r.juego_mas_reservado.map(f => [f.juego, f.total_reservas]),
            theme: 'striped',
            headStyles: { fillColor: COLOR_CARMINE },
            styles: { fontSize: 9 }
        });
        y = doc.lastAutoTable.finalY + 10;
    }

    // ---- Tabla: Día más transitado ----
    doc.autoTable({
        startY: y,
        head: [['Día', 'Total reservas']],
        body: (r.dia_mas_transitado || []).map(f => [f.dia, f.total_reservas]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Hora más transitada ----
    doc.autoTable({
        startY: y,
        head: [['Hora', 'Total reservas']],
        body: (r.hora_mas_transitada || []).map(f => [
            String(f.hora).substring(0, 5),
            f.total_reservas
        ]),
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });

    doc.save(`reportes_jaguar_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// Exportar a Excel (se genera en el navegador con SheetJS)
// ============================================================
function exportarExcel() {
    const r = state.ultimoResumen;
    if (!r) return;

    const totalReservas = (r.reservas_por_carrera || [])
        .reduce((s, f) => s + Number(f.total_reservas || 0), 0);

    const estados = r.reservas_por_estado || {};
    const asistencia = r.asistencia || { total_asistencias: 0, reservas_con_asistencia: 0 };

    const wb = XLSX.utils.book_new();

    // ---- Hoja: Resumen ----
    const resumenAOA = [
        ['Reportes Jaguar Reservation'],
        ['Periodo', state.etiquetaPeriodo],
        ['Generado', new Date().toLocaleString('es-HN')],
        [],
        ['Indicador', 'Valor'],
        ['Total de reservas', totalReservas],
        ['Reservas aprobadas', estados.aprobada || 0],
        ['Reservas pendientes', estados.pendiente || 0],
        ['Reservas canceladas', estados.cancelada || 0],
        ['Reservas rechazadas', estados.rechazada || 0],
        ['Reservas sin asistencia (nadie llegó)', r.reservas_sin_asistencia || 0],
        ['Asistencias registradas', asistencia.total_asistencias],
        ['Reservas con asistencia registrada', asistencia.reservas_con_asistencia],
        ['Estudiantes que reservaron y son integrantes de un club', r.estudiantes_en_clubes || 0]
    ];
    const hojaResumen = XLSX.utils.aoa_to_sheet(resumenAOA);
    XLSX.utils.book_append_sheet(wb, hojaResumen, 'Resumen');

    // ---- Hoja: Reservas por carrera ----
    const hojaCarrera = XLSX.utils.json_to_sheet(
        (r.reservas_por_carrera || []).map(f => ({
            Carrera: f.carrera,
            'Total reservas': f.total_reservas
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaCarrera, 'Por carrera');

    // ---- Hoja: Reservas por espacio ----
    const hojaEspacio = XLSX.utils.json_to_sheet(
        (r.reservas_por_espacio || []).map(f => ({
            Espacio: f.espacio,
            'Total reservas': f.total_reservas
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaEspacio, 'Por espacio');

    // ---- Hoja: Primer ingreso vs reingreso ----
    const hojaIngreso = XLSX.utils.json_to_sheet(
        (r.comparativo_primer_ingreso || []).map(f => ({
            Categoría: f.categoria,
            'Total reservas': f.total_reservas
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaIngreso, 'Primer ingreso');

    // ---- Hoja: Integrantes por equipo ----
    const hojaEquipos = XLSX.utils.json_to_sheet(
        (r.integrantes_por_equipo || []).map(f => ({
            Equipo: f.equipo,
            Deporte: f.deporte,
            Integrantes: f.cantidad_integrantes
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaEquipos, 'Equipos');

    // ---- Hoja: Integrantes por club ----
    const hojaClubes = XLSX.utils.json_to_sheet(
        (r.integrantes_por_club || []).map(f => ({
            Club: f.club,
            Integrantes: f.cantidad_integrantes
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaClubes, 'Clubes');

    // ---- Hoja: Juego más reservado ----
    if ((r.juego_mas_reservado || []).length) {
        const hojaJuegos = XLSX.utils.json_to_sheet(
            r.juego_mas_reservado.map(f => ({
                Juego: f.juego,
                'Total reservas': f.total_reservas
            }))
        );
        XLSX.utils.book_append_sheet(wb, hojaJuegos, 'Zona Jaguar');
    }

    // ---- Hoja: Día más transitado ----
    const hojaDias = XLSX.utils.json_to_sheet(
        (r.dia_mas_transitado || []).map(f => ({
            Día: f.dia,
            'Total reservas': f.total_reservas
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaDias, 'Por día');

    // ---- Hoja: Hora más transitada ----
    const hojaHoras = XLSX.utils.json_to_sheet(
        (r.hora_mas_transitada || []).map(f => ({
            Hora: String(f.hora).substring(0, 5),
            'Total reservas': f.total_reservas
        }))
    );
    XLSX.utils.book_append_sheet(wb, hojaHoras, 'Por hora');

    XLSX.writeFile(wb, `reportes_jaguar_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    els.exportPdfBtn.addEventListener('click', exportarPDF);
    els.exportExcelBtn.addEventListener('click', exportarExcel);
});