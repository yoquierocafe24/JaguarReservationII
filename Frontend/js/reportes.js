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

    const totalReservas = (r.reservas_por_carrera || [])
        .reduce((s, f) => s + Number(f.total_reservas || 0), 0);

    const estados = r.reservas_por_estado || {};

    const asistencia = r.asistencia || {
        total_asistencias: 0,
        asistencias_por_reserva: 0,
        asistencias_libres: 0,
        reservas_con_asistencia: 0
    };

    const lineas = [];
    lineas.push(`Reportes Jaguar Reservation`);
    lineas.push(`Periodo,${state.etiquetaPeriodo}`);
    lineas.push(`Generado,${new Date().toLocaleString('es-HN')}`);
    lineas.push('');

    lineas.push('Indicadores generales');
    lineas.push('Indicador,Valor,Que significa');
    lineas.push(`Total de reservas,${totalReservas},"Cantidad total de reservas en el periodo, sin importar su estado."`);
    lineas.push(`Reservas aprobadas,${estados.aprobada || 0},"Reservas que un administrador aprobo y quedaron confirmadas."`);
    lineas.push(`Reservas pendientes,${estados.pendiente || 0},"Reservas que todavia esperan aprobacion o rechazo."`);
    lineas.push(`Reservas canceladas,${estados.cancelada || 0},"Reservas canceladas por el estudiante o un administrador."`);
    lineas.push(`Reservas rechazadas,${estados.rechazada || 0},"Reservas que un administrador rechazo explicitamente."`);
    lineas.push(`Reservas sin asistencia (nadie llego),${r.reservas_sin_asistencia || 0},"Reservas aprobadas donde nadie registro su entrada."`);
    lineas.push(`Asistencias registradas (total),${asistencia.total_asistencias},"Todas las entradas registradas: de reserva mas accesos libres."`);
    lineas.push(`Asistencias por reserva,${asistencia.asistencias_por_reserva},"Entradas que si corresponden a una reserva."`);
    lineas.push(`Accesos libres registrados,${asistencia.asistencias_libres},"Entradas SIN que existiera una reserva de por medio."`);
    lineas.push(`Reservas con asistencia registrada,${asistencia.reservas_con_asistencia},"Reservas distintas con al menos una persona presente."`);
    lineas.push(`Estudiantes que reservaron y son integrantes de un club,${r.estudiantes_en_clubes || 0},"De los que reservaron, cuantos pertenecen a un club."`);
    lineas.push('');

    lineas.push('Reservas por carrera');
    lineas.push('Cantidad de reservas realizadas por estudiantes de cada carrera.');
    lineas.push('Carrera,Total reservas');
    (r.reservas_por_carrera || []).forEach(f => lineas.push(`${csv(f.carrera)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Reservas por espacio');
    lineas.push('Cantidad de reservas realizadas en cada espacio del polideportivo.');
    lineas.push('Espacio,Total reservas');
    (r.reservas_por_espacio || []).forEach(f => lineas.push(`${csv(f.espacio)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Primer ingreso vs reingreso');
    lineas.push('Compara reservas de estudiantes de primer ingreso frente a reingreso.');
    lineas.push('Categoria,Total reservas');
    (r.comparativo_primer_ingreso || []).forEach(f => lineas.push(`${csv(f.categoria)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Integrantes por equipo');
    lineas.push('Cantidad de integrantes activos en cada equipo deportivo.');
    lineas.push('Equipo,Deporte,Integrantes');
    (r.integrantes_por_equipo || []).forEach(f =>
        lineas.push(`${csv(f.equipo)},${csv(f.deporte)},${f.cantidad_integrantes}`));
    lineas.push('');

    lineas.push('Integrantes por club');
    lineas.push('Cantidad de integrantes activos en cada club.');
    lineas.push('Club,Integrantes');
    (r.integrantes_por_club || []).forEach(f =>
        lineas.push(`${csv(f.club)},${f.cantidad_integrantes}`));
    lineas.push('');

    if ((r.juego_mas_reservado || []).length) {
        lineas.push('Juego mas reservado (Zona Jaguar)');
        lineas.push('Los juegos mas solicitados. La marca * indica el mas reservado.');
        lineas.push('Juego,Total reservas');
        r.juego_mas_reservado.forEach((f, idx) =>
            lineas.push(`${csv(idx === 0 ? `* ${f.juego}` : f.juego)},${f.total_reservas}`));
        lineas.push('');
    }

    lineas.push('Dia mas transitado');
    lineas.push('Dia de la semana con mas reservas. La marca * indica el dia mas transitado.');
    lineas.push('Dia,Total reservas');
    (r.dia_mas_transitado || []).forEach((f, idx) =>
        lineas.push(`${csv(idx === 0 ? `* ${f.dia}` : f.dia)},${f.total_reservas}`));
    lineas.push('');

    lineas.push('Hora mas transitada');
    lineas.push('Hora del dia con mas reservas. La marca * indica la hora mas transitada.');
    lineas.push('Hora,Total reservas');
    (r.hora_mas_transitada || []).forEach((f, idx) => {
        const horaTexto = String(f.hora).substring(0, 5);
        lineas.push(`${csv(idx === 0 ? `* ${horaTexto}` : horaTexto)},${f.total_reservas}`);
    });

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
// Convierte una imagen (por URL/ruta) en un data URL base64,
// y devuelve también su ancho/alto reales — así el logo se
// puede insertar en el PDF sin distorsionarse.
// ============================================================
function cargarImagenComoDataURL(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            resolve({
                dataUrl: canvas.toDataURL('image/png'),
                width: img.naturalWidth,
                height: img.naturalHeight
            });
        };
        img.onerror = reject;
        img.src = url;
    });
}
// ============================================================
// Revisa si una tabla (de cierta cantidad de filas) cabe en
// lo que queda de la página actual. Si no cabe, salta de
// página limpiamente ANTES de dibujarla, para evitar que
// autoTable la corte a la mitad dejando espacio en blanco.
// ============================================================
function asegurarEspacio(doc, y, cantidadFilas) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    const margenInferior = 15;

    // Estimado: ~7mm por fila + ~10mm de encabezado de tabla
    const alturaEstimada = 10 + (cantidadFilas * 7);

    if (y + alturaEstimada > alturaPagina - margenInferior) {
        doc.addPage();
        return 20; // posición inicial en la página nueva
    }

    return y;
}

// ============================================================
// Dibuja una línea de texto explicativo (gris, itálica) justo
// antes de una tabla, para que quien lea el PDF entienda qué
// significa esa sección sin depender de que alguien se lo
// explique aparte. Devuelve la nueva posición Y.
// ============================================================
function dibujarSubtitulo(doc, y, texto) {
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(120, 120, 120);
    doc.text(texto, 14, y);
    doc.setFont(undefined, 'normal');
    return y + 5;
}

// ============================================================
// Exportar a PDF (se genera en el navegador con jsPDF)
// ============================================================
async function exportarPDF() {
    const r = state.ultimoResumen;
    if (!r) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const COLOR_CARMINE = [147, 6, 30];
    const COLOR_TEXTO = [80, 80, 80];

    // ---- Encabezado con logo institucional ----
    let xTexto = 14;

    try {
        const logo = await cargarImagenComoDataURL('../img/V.E CEUTEC logo-01.png');

        const altoLogo = 14;
        const anchoLogo = altoLogo * (logo.width / logo.height);
        const yLogo = 10;

        doc.addImage(logo.dataUrl, 'PNG', 14, yLogo, anchoLogo, altoLogo);

        xTexto = 14 + anchoLogo + 6;

    } catch (error) {
        console.error('No se pudo cargar el logo para el PDF:', error);
    }

    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text('Universidad Tecnológica Centroamericana (CEUTEC)', xTexto, 15);

    doc.setFontSize(16);
    doc.setTextColor(...COLOR_CARMINE);
    doc.text('Reportes Jaguar Reservation', xTexto, 22);

    let y = 32;

    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(`Periodo: ${state.etiquetaPeriodo}`, 14, y);

    y += 5;
    doc.text(`Generado: ${new Date().toLocaleDateString('es-HN')}`, 14, y);

    y += 8;

    // ---- Totales calculados a partir de los datos ----
    const totalReservas = (r.reservas_por_carrera || [])
        .reduce((s, f) => s + Number(f.total_reservas || 0), 0);

    const estados = r.reservas_por_estado || {};
    const asistencia = r.asistencia || {
        total_asistencias: 0,
        asistencias_por_reserva: 0,
        asistencias_libres: 0,
        reservas_con_asistencia: 0
    };

    // ---- Tabla: Indicadores generales ----
    // Se agrega una tercera columna con una explicación breve
    // de qué significa cada indicador, para que cualquiera en
    // administración pueda leer el reporte sin depender de que
    // alguien más se lo explique.
    const filasIndicadores = [
        ['Total de reservas', totalReservas, 'Cantidad total de reservas realizadas en el periodo seleccionado, sin importar su estado.'],
        ['Reservas aprobadas', estados.aprobada || 0, 'Reservas que un administrador aprobó y quedaron confirmadas.'],
        ['Reservas pendientes', estados.pendiente || 0, 'Reservas que todavía esperan que un administrador las apruebe o rechace.'],
        ['Reservas canceladas', estados.cancelada || 0, 'Reservas que el propio estudiante o un administrador canceló antes de su horario.'],
        ['Reservas rechazadas', estados.rechazada || 0, 'Reservas que un administrador rechazó explícitamente.'],
        ['Reservas sin asistencia (nadie llegó)', r.reservas_sin_asistencia || 0, 'De las reservas aprobadas, cuántas terminaron sin que absolutamente nadie (ni titular ni acompañantes) registrara su entrada con el guardia.'],
        ['Asistencias registradas (total)', asistencia.total_asistencias, 'Todas las entradas registradas por el guardia: las que vienen de una reserva más los accesos libres.'],
        ['Asistencias por reserva', asistencia.asistencias_por_reserva, 'Entradas registradas que sí corresponden a una reserva (titular, acompañante o integrante de equipo).'],
        ['Accesos libres registrados', asistencia.asistencias_libres, 'Entradas registradas por el guardia SIN que existiera una reserva de por medio (acceso libre al polideportivo).'],
        ['Reservas con asistencia registrada', asistencia.reservas_con_asistencia, 'Cuántas reservas distintas tuvieron al menos una persona que sí llegó (aunque no haya sido el grupo completo).'],
        ['Estudiantes que reservaron y son integrantes de un club', r.estudiantes_en_clubes || 0, 'De los estudiantes que reservaron en este periodo, cuántos también pertenecen activamente a algún club.']
    ];

    y = asegurarEspacio(doc, y, filasIndicadores.length);
    doc.autoTable({
        startY: y,
        head: [['Indicador', 'Valor', 'Qué significa']],
        body: filasIndicadores,
        theme: 'grid',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 'auto' }
        }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Reservas por carrera ----
    const filasCarrera = (r.reservas_por_carrera || []).map(f => [f.carrera, f.total_reservas]);
    y = asegurarEspacio(doc, y, filasCarrera.length + 1);
    y = dibujarSubtitulo(doc, y, 'Cantidad de reservas realizadas por estudiantes de cada carrera.');
    doc.autoTable({
        startY: y,
        head: [['Carrera', 'Total reservas']],
        body: filasCarrera,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Reservas por espacio ----
    const filasEspacio = (r.reservas_por_espacio || []).map(f => [f.espacio, f.total_reservas]);
    y = asegurarEspacio(doc, y, filasEspacio.length + 1);
    y = dibujarSubtitulo(doc, y, 'Cantidad de reservas realizadas en cada espacio del polideportivo.');
    doc.autoTable({
        startY: y,
        head: [['Espacio', 'Total reservas']],
        body: filasEspacio,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Primer ingreso vs reingreso ----
    const filasIngreso = (r.comparativo_primer_ingreso || []).map(f => [f.categoria, f.total_reservas]);
    y = asegurarEspacio(doc, y, filasIngreso.length + 1);
    y = dibujarSubtitulo(doc, y, 'Compara cuántas reservas hicieron estudiantes de primer ingreso frente a estudiantes de reingreso.');
    doc.autoTable({
        startY: y,
        head: [['Categoría', 'Total reservas']],
        body: filasIngreso,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Integrantes por equipo ----
    const filasEquipos = (r.integrantes_por_equipo || []).map(f => [f.equipo, f.deporte, f.cantidad_integrantes]);
    y = asegurarEspacio(doc, y, filasEquipos.length + 1);
    y = dibujarSubtitulo(doc, y, 'Cantidad de integrantes activos en cada equipo deportivo.');
    doc.autoTable({
        startY: y,
        head: [['Equipo', 'Deporte', 'Integrantes']],
        body: filasEquipos,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Integrantes por club ----
    const filasClubes = (r.integrantes_por_club || []).map(f => [f.club, f.cantidad_integrantes]);
    y = asegurarEspacio(doc, y, filasClubes.length + 1);
    y = dibujarSubtitulo(doc, y, 'Cantidad de integrantes activos en cada club.');
    doc.autoTable({
        startY: y,
        head: [['Club', 'Integrantes']],
        body: filasClubes,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Juego más reservado ----
    if ((r.juego_mas_reservado || []).length) {
        const filasJuegos = r.juego_mas_reservado.map(f => [f.juego, f.total_reservas]);
        y = asegurarEspacio(doc, y, filasJuegos.length + 1);
        y = dibujarSubtitulo(doc, y, 'Los juegos de la Zona Jaguar más solicitados. La fila resaltada es el más reservado.');
        doc.autoTable({
            startY: y,
            head: [['Juego (Zona Jaguar)', 'Total reservas']],
            body: filasJuegos,
            theme: 'striped',
            headStyles: { fillColor: COLOR_CARMINE },
            styles: { fontSize: 9 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.row.index === 0) {
                    data.cell.styles.fillColor = [255, 236, 179];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
        y = doc.lastAutoTable.finalY + 10;
    }

    // ---- Tabla: Día más transitado ----
    const filasDias = (r.dia_mas_transitado || []).map(f => [f.dia, f.total_reservas]);
    y = asegurarEspacio(doc, y, filasDias.length + 1);
    y = dibujarSubtitulo(doc, y, 'Día de la semana con más reservas. La fila resaltada es el día más transitado.');
    doc.autoTable({
        startY: y,
        head: [['Día', 'Total reservas']],
        body: filasDias,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === 0) {
                data.cell.styles.fillColor = [255, 236, 179];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Tabla: Hora más transitada ----
    const filasHoras = (r.hora_mas_transitada || []).map(f => [
        String(f.hora).substring(0, 5),
        f.total_reservas
    ]);
    y = asegurarEspacio(doc, y, filasHoras.length + 1);
    y = dibujarSubtitulo(doc, y, 'Hora del día con más reservas. La fila resaltada es la hora más transitada.');
    doc.autoTable({
        startY: y,
        head: [['Hora', 'Total reservas']],
        body: filasHoras,
        theme: 'striped',
        headStyles: { fillColor: COLOR_CARMINE },
        styles: { fontSize: 9 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === 0) {
                data.cell.styles.fillColor = [255, 236, 179];
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    doc.save(`reportes_jaguar_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================
// Exportar a Excel (se genera en el navegador con SheetJS)
// Todo en UNA sola hoja, con las secciones apiladas.
// ============================================================
function exportarExcel() {
    const r = state.ultimoResumen;
    if (!r) return;

    const totalReservas = (r.reservas_por_carrera || [])
        .reduce((s, f) => s + Number(f.total_reservas || 0), 0);

    const estados = r.reservas_por_estado || {};
    const asistencia = r.asistencia || {
        total_asistencias: 0,
        asistencias_por_reserva: 0,
        asistencias_libres: 0,
        reservas_con_asistencia: 0
    };

    const filas = [];

    // ---- Encabezado ----
    filas.push(['Universidad Tecnológica Centroamericana (CEUTEC)']);
    filas.push(['Reportes Jaguar Reservation']);
    filas.push(['Periodo', state.etiquetaPeriodo]);
    filas.push(['Generado', new Date().toLocaleDateString('es-HN')]);
    filas.push([]);

    // ---- Indicadores generales ----
    filas.push(['INDICADORES GENERALES']);
    filas.push(['Indicador', 'Valor', 'Qué significa']);
    filas.push(['Total de reservas', totalReservas, 'Cantidad total de reservas realizadas en el periodo seleccionado, sin importar su estado.']);
    filas.push(['Reservas aprobadas', estados.aprobada || 0, 'Reservas que un administrador aprobó y quedaron confirmadas.']);
    filas.push(['Reservas pendientes', estados.pendiente || 0, 'Reservas que todavía esperan que un administrador las apruebe o rechace.']);
    filas.push(['Reservas canceladas', estados.cancelada || 0, 'Reservas que el propio estudiante o un administrador canceló antes de su horario.']);
    filas.push(['Reservas rechazadas', estados.rechazada || 0, 'Reservas que un administrador rechazó explícitamente.']);
    filas.push(['Reservas sin asistencia (nadie llegó)', r.reservas_sin_asistencia || 0, 'De las reservas aprobadas, cuántas terminaron sin que nadie registrara su entrada con el guardia.']);
    filas.push(['Asistencias registradas (total)', asistencia.total_asistencias, 'Todas las entradas registradas por el guardia: las de una reserva más los accesos libres.']);
    filas.push(['Asistencias por reserva', asistencia.asistencias_por_reserva, 'Entradas registradas que sí corresponden a una reserva (titular, acompañante o integrante).']);
    filas.push(['Accesos libres registrados', asistencia.asistencias_libres, 'Entradas registradas SIN que existiera una reserva de por medio.']);
    filas.push(['Reservas con asistencia registrada', asistencia.reservas_con_asistencia, 'Cuántas reservas distintas tuvieron al menos una persona que sí llegó.']);
    filas.push(['Estudiantes que reservaron y son integrantes de un club', r.estudiantes_en_clubes || 0, 'De los estudiantes que reservaron en este periodo, cuántos también pertenecen a un club.']);
    filas.push([]);

    // ---- Reservas por carrera ----
    filas.push(['RESERVAS POR CARRERA']);
    filas.push(['Cantidad de reservas realizadas por estudiantes de cada carrera.']);
    filas.push(['Carrera', 'Total reservas']);
    (r.reservas_por_carrera || []).forEach(f => filas.push([f.carrera, f.total_reservas]));
    filas.push([]);

    // ---- Reservas por espacio ----
    filas.push(['RESERVAS POR ESPACIO']);
    filas.push(['Cantidad de reservas realizadas en cada espacio del polideportivo.']);
    filas.push(['Espacio', 'Total reservas']);
    (r.reservas_por_espacio || []).forEach(f => filas.push([f.espacio, f.total_reservas]));
    filas.push([]);

    // ---- Primer ingreso vs reingreso ----
    filas.push(['PRIMER INGRESO VS REINGRESO']);
    filas.push(['Compara cuántas reservas hicieron estudiantes de primer ingreso frente a estudiantes de reingreso.']);
    filas.push(['Categoría', 'Total reservas']);
    (r.comparativo_primer_ingreso || []).forEach(f => filas.push([f.categoria, f.total_reservas]));
    filas.push([]);

    // ---- Integrantes por equipo ----
    filas.push(['INTEGRANTES POR EQUIPO']);
    filas.push(['Cantidad de integrantes activos en cada equipo deportivo.']);
    filas.push(['Equipo', 'Deporte', 'Integrantes']);
    (r.integrantes_por_equipo || []).forEach(f => filas.push([f.equipo, f.deporte, f.cantidad_integrantes]));
    filas.push([]);

    // ---- Integrantes por club ----
    filas.push(['INTEGRANTES POR CLUB']);
    filas.push(['Cantidad de integrantes activos en cada club.']);
    filas.push(['Club', 'Integrantes']);
    (r.integrantes_por_club || []).forEach(f => filas.push([f.club, f.cantidad_integrantes]));
    filas.push([]);

    // ---- Juego más reservado ----
    // La fila con más reservas se marca con ⭐ (Excel no soporta
    // colorear celdas fácilmente con esta librería gratuita).
    if ((r.juego_mas_reservado || []).length) {
        filas.push(['JUEGO MÁS RESERVADO (ZONA JAGUAR)']);
        filas.push(['Los juegos de la Zona Jaguar más solicitados. ⭐ = el más reservado.']);
        filas.push(['Juego', 'Total reservas']);
        r.juego_mas_reservado.forEach((f, idx) =>
            filas.push([idx === 0 ? `⭐ ${f.juego}` : f.juego, f.total_reservas]));
        filas.push([]);
    }

    // ---- Día más transitado ----
    filas.push(['DÍA MÁS TRANSITADO']);
    filas.push(['Día de la semana con más reservas. ⭐ = el día más transitado.']);
    filas.push(['Día', 'Total reservas']);
    (r.dia_mas_transitado || []).forEach((f, idx) =>
        filas.push([idx === 0 ? `⭐ ${f.dia}` : f.dia, f.total_reservas]));
    filas.push([]);

    // ---- Hora más transitada ----
    filas.push(['HORA MÁS TRANSITADA']);
    filas.push(['Hora del día con más reservas. ⭐ = la hora más transitada.']);
    filas.push(['Hora', 'Total reservas']);
    (r.hora_mas_transitada || []).forEach((f, idx) =>
        filas.push([idx === 0 ? `⭐ ${String(f.hora).substring(0, 5)}` : String(f.hora).substring(0, 5), f.total_reservas]));

    const wb = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    XLSX.utils.book_append_sheet(wb, hoja, 'Reporte');

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