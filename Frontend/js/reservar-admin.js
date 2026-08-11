const API_URL =
    "https://jaguarreservationii-production.up.railway.app";

const MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SM = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const TODAY   = new Date();
const RESERVAS_POR_PAGINA = 6;

// Ultimas reservas traidas del backend. La busqueda por nombre filtra
// sobre esto en el navegador; estado/espacio/fecha los filtra el servidor.
let reservas = [];
let paginaActual = 1;
let reservaIdParaCancelar = null;


// ── Topbar fecha ──
function actualizarFechaTopbar() {
  const elemento =
    document.getElementById('topbar-fecha') ||
    document.getElementById('topbar-date');

  if (!elemento) return;

  const ahora = new Date();

  const fecha = ahora.toLocaleDateString('es-HN', {
    weekday:'long',
    day:'numeric',
    month:'long',
    year:'numeric'
  });

  const hora = ahora.toLocaleTimeString('es-HN', {
    hour:'2-digit',
    minute:'2-digit'
  });

  const fechaFinal =
    fecha.charAt(0).toUpperCase() +
    fecha.slice(1);

  elemento.textContent = `${fechaFinal} · ${hora}`;
}

function obtenerSoloFecha(fecha) {
  if (!fecha) return '';

  return String(fecha).substring(0,10);
}

function obtenerSoloHora(hora) {
  if (!hora) return '00:00';

  return String(hora).substring(0,5);
}

function construirFechaHora(fecha, hora) {
  const fechaTexto = obtenerSoloFecha(fecha);
  const horaTexto = obtenerSoloHora(hora);

  return new Date(`${fechaTexto}T${horaTexto}:00`);
}

function reservaEstaVencida(reserva) {
  if (!reserva.fecha || !reserva.hora_fin) {
    return false;
  }

  const fechaFin = construirFechaHora(
    reserva.fecha,
    reserva.hora_fin
  );

  if (Number.isNaN(fechaFin.getTime())) {
    return false;
  }

  return fechaFin < new Date();
}

function reservaPuedeCancelarse(reserva) {
  if (!reserva.fecha || !reserva.hora_inicio) {
    return false;
  }

  if (reserva.estado !== 'aprobada') {
    return false;
  }

  const fechaInicio = construirFechaHora(
    reserva.fecha,
    reserva.hora_inicio
  );

  if (Number.isNaN(fechaInicio.getTime())) {
    return false;
  }

  return fechaInicio > new Date();
}

function obtenerEstadoVisual(reserva) {
  if (
    reservaEstaVencida(reserva) &&
    ['pendiente','aprobada'].includes(reserva.estado)
  ) {
    return {
      texto:'Vencida',
      clase:'vencida'
    };
  }

  const estados = {
    pendiente:{
      texto:'Pendiente',
      clase:'pendiente'
    },
    aprobada:{
      texto:'Aprobada',
      clase:'aprobada'
    },
    rechazada:{
      texto:'Rechazada',
      clase:'rechazada'
    },
    cancelada:{
      texto:'Cancelada',
      clase:'cancelada'
    }
  };

  return estados[reserva.estado] || {
    texto:reserva.estado || 'Sin estado',
    clase:'cancelada'
  };
}

// ── FORMATO ──

// Convierte "14:00" -> "2:00 PM"
function formatear12h(hora24) {
  let [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2,'0')} ${periodo}`;
}


function formatearFecha(fecha) {
  const texto = obtenerSoloFecha(fecha);

  if (!texto) {
    return 'Sin fecha';
  }

  const [anio, mes, dia] = texto.split('-');

  if (!anio || !mes || !dia) {
    return texto;
  }

  const nombreMes =
    MESES[Number(mes) - 1]?.substring(0,3) || mes;

  return `${Number(dia)} ${nombreMes} ${anio}`;
}

// Los nombres vienen de la base: si alguno trae < o &, romperia la tabla.
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}


// ── SESION: solo admin ──
async function verificarAdmin() {
  try {
    const res = await fetch(`${API_URL}/api/auth/session`, {
      credentials:'include'
    });

    const data = await res.json();

    if (!res.ok || !data.ok || data.usuario?.rol !== 'admin') {
      window.location.href = '../../login.html';
      return false;
    }

    const nombre = data.usuario.nombre || 'Administrador';

    document.getElementById('usuario-nombre').textContent = nombre;
    document.getElementById('usuario-avatar').textContent = obtenerIniciales(nombre);

    return true;

  } catch(error) {
    console.error(error);
    mostrarToast('No se pudo conectar con el servidor.','danger');
    return false;
  }
}

function obtenerIniciales(nombre='') {
  return nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0,2)
    .map(parte => parte[0])
    .join('')
    .toUpperCase() || 'A';
}


// ── CARGAR ──
async function cargarReservas() {

  paginaActual = 1;

  const params = new URLSearchParams();

  const estado  = document.getElementById('filtro-estado').value;
  const espacio = document.getElementById('filtro-espacio').value;
  const fecha   = document.getElementById('filtro-fecha').value;

  if (estado)  params.append('estado', estado);
  if (espacio) params.append('espacio', espacio);
  if (fecha)   params.append('fecha', fecha);

  try {

    const res = await fetch(`${API_URL}/api/reservas?${params}`, {
      credentials: 'include'
    });

    const data = await res.json();

    if (!data.ok) {
      mostrarToast(data.mensaje || 'No se pudieron cargar las reservas.', 'danger');
      return;
    }

    reservas = data.reservas;

    renderTabla();
    renderResumen();

  } catch (error) {
    console.error(error);
    mostrarToast('No se pudo conectar con el servidor.', 'danger');
  }

}


// ── RESUMEN ──
// Cuenta sobre lo que trajo el servidor. Con un filtro de estado activo
// los demas contadores quedan en 0, que es coherente con lo que se ve.
function renderResumen() {

  const estados = ['pendiente','aprobada','rechazada','cancelada'];

  estados.forEach(e => {
    document.getElementById(`total-${e}`).textContent =
      reservas.filter(r => r.estado === e).length;
  });

}


// ── PAGINACIÓN ──
function renderPaginacion(totalPaginas) {
  const contenedor = document.getElementById('paginacion-reservas');

  if (!contenedor) return;

  if (totalPaginas <= 1) {
    contenedor.innerHTML = '';
    contenedor.style.display = 'none';
    return;
  }

  const botones = [];

  botones.push(`
    <button
      type="button"
      class="paginacion-btn"
      onclick="cambiarPagina(${Math.max(1, paginaActual - 1)})"
      ${paginaActual === 1 ? 'disabled' : ''}
    >
      <i class="bi bi-chevron-left"></i>
    </button>
  `);

  for (let i = 1; i <= totalPaginas; i += 1) {
    botones.push(`
      <button
        type="button"
        class="paginacion-btn ${i === paginaActual ? 'activa' : ''}"
        onclick="cambiarPagina(${i})"
      >
        ${i}
      </button>
    `);
  }

  botones.push(`
    <button
      type="button"
      class="paginacion-btn"
      onclick="cambiarPagina(${Math.min(totalPaginas, paginaActual + 1)})"
      ${paginaActual === totalPaginas ? 'disabled' : ''}
    >
      <i class="bi bi-chevron-right"></i>
    </button>
  `);

  contenedor.innerHTML = botones.join('');
  contenedor.style.display = 'flex';
}

function cambiarPagina(pagina) {
  paginaActual = Math.max(1, pagina);
  renderTabla();
}

// ── TABLA ──
function renderTabla() {

  const busqueda =
    document
      .getElementById('filtro-buscar')
      .value
      .trim()
      .toLowerCase();

  const visibles = busqueda
    ? reservas.filter(r => {
        const codigo =
          String(r.id_reserva || '').toLowerCase();

        const nombre =
          String(
            r.estudiante_nombre ||
            r.nombre_estudiante ||
            ''
          ).toLowerCase();

        const cuenta =
          String(
            r.estudiante_cuenta ||
            r.cuenta ||
            ''
          ).toLowerCase();

        return (
          codigo.includes(busqueda) ||
          nombre.includes(busqueda) ||
          cuenta.includes(busqueda)
        );
      })
    : reservas;

  const totalPaginas = Math.max(
    1,
    Math.ceil(visibles.length / RESERVAS_POR_PAGINA)
  );

  paginaActual = Math.min(paginaActual, totalPaginas);

  const inicio = (paginaActual - 1) * RESERVAS_POR_PAGINA;
  const paginaActualItems = visibles.slice(
    inicio,
    inicio + RESERVAS_POR_PAGINA
  );

  const body =
    document.getElementById('tabla-body');

  const vacia =
    document.getElementById('tabla-vacia');

  vacia.style.display =
    visibles.length ? 'none' : 'block';

  body.innerHTML = paginaActualItems.map(r => {
    const estadoVisual =
      obtenerEstadoVisual(r);
      
//borrar luego 
    const vencida =
      reservaEstaVencida(r);

    return `
      <tr>

        <td class="celda-id">
          ${escapar(r.id_reserva)}
        </td>

        <td class="celda-persona">
          <strong>
            ${escapar(
              r.estudiante_nombre ||
              r.nombre_estudiante ||
              'Sin nombre'
            )}
          </strong>

          <small>
            ${escapar(
              r.estudiante_cuenta ||
              r.cuenta ||
              '—'
            )}
          </small>
        </td>

        <td>
          ${escapar(
            r.espacio_nombre ||
            obtenerNombreEspacio(r.id_espacio)
          )}

          ${
            r.item_nombre
              ? `<span class="celda-juego">
                  ${escapar(r.item_nombre)}
                </span>`
              : ''
          }
        </td>

        <td>
          ${formatearFecha(r.fecha)}
        </td>

        <td class="celda-hora">
          ${formatear12h(obtenerSoloHora(r.hora_inicio))}
          –
          ${formatear12h(obtenerSoloHora(r.hora_fin))}
        </td>

        <td>
          ${Number(r.cant_acompanantes || 0)}
        </td>

        <td>
          <span class="badge-estado ${estadoVisual.clase}">
            ${estadoVisual.texto}
          </span>
        </td>

        <td>
          <div class="acciones">
            <button
              type="button"
              class="btn-accion ver"
              title="Ver detalle"
              onclick="verDetalle('${r.id_reserva}')"
            >
              <i class="bi bi-eye"></i>
            </button>

            ${accionesDe(r)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginacion(totalPaginas);
}


function accionesDe(r) {
  if (reservaEstaVencida(r)) {
    return '';
  }

  if (r.estado === 'pendiente') {
    return `
      <button
        type="button"
        class="btn-accion aprobar"
        title="Aprobar"
        onclick="resolver('${r.id_reserva}','aprobar')"
      >
        <i class="bi bi-check-lg"></i>
      </button>

      <button
        type="button"
        class="btn-accion rechazar"
        title="Rechazar"
        onclick="resolver('${r.id_reserva}','rechazar')"
      >
        <i class="bi bi-x-lg"></i>
      </button>
    `;
  }

  if (reservaPuedeCancelarse(r)) {
    return `
      <button
        type="button"
        class="btn-accion cancelar"
        title="Cancelar"
        onclick="cancelar('${r.id_reserva}')"
      >
        <i class="bi bi-slash-circle"></i>
      </button>
    `;
  }

  return '';
}

// ── ACCIONES ──
async function resolver(id, accion) {
  try {
    const url = `${API_URL}/api/reservas/${encodeURIComponent(id)}/${accion}`;

    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const texto = await res.text();

    let data;

    try {
      data = JSON.parse(texto);
    } catch {
      console.error('Respuesta no JSON del servidor:', texto);
      throw new Error(`La ruta respondió con estado ${res.status}.`);
    }

    if (!res.ok || !data.ok) {
      throw new Error(
        data.mensaje ||
        `No se pudo ${accion} la reserva.`
      );
    }

    mostrarToast(
      data.mensaje || 'Reserva actualizada correctamente.',
      'success'
    );

    await cargarReservas();

  } catch (error) {
    console.error(`Error al ${accion}:`, error);

    mostrarToast(
      error.message || 'No se pudo actualizar la reserva.',
      'danger'
    );
  }
}


function cancelar(id) {
    const reserva = reservas.find(
        r => r.id_reserva === id
    );

    if (!reserva) {
        mostrarToast(
            'No se encontró la reserva.',
            'danger'
        );
        return;
    }

    if (!reservaPuedeCancelarse(reserva)) {
        mostrarToast(
            'La reserva ya comenzó o venció y no puede cancelarse.',
            'warning'
        );
        return;
    }

    reservaIdParaCancelar = id;

    document.getElementById(
        'motivo-cancelacion-admin'
    ).value = '';

    document.getElementById(
        'cancelacion-status'
    ).textContent = '';

    abrirModal(
        document.getElementById(
            'modal-cancelar-reserva'
        )
    );
}


async function confirmarCancelacionAdmin() {

    if (!reservaIdParaCancelar) return;

    const motivo =
        document.getElementById(
            'motivo-cancelacion-admin'
        ).value.trim();

    const status =
        document.getElementById(
            'cancelacion-status'
        );

    status.classList.remove('error');
    status.textContent = '';

    if (!motivo) {
        status.textContent =
            'Debe indicar el motivo de la cancelación.';
        status.classList.add('error');
        return;
    }

    if (motivo.length < 5) {
        status.textContent =
            'El motivo debe tener al menos 5 caracteres.';
        status.classList.add('error');
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/api/reservas/${encodeURIComponent(reservaIdParaCancelar)}/cancelar`,
            {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    motivo_cancelacion: motivo
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.mensaje ||
                'No se pudo cancelar la reserva.'
            );
        }

        cerrarModal(
            document.getElementById(
                'modal-cancelar-reserva'
            )
        );

        reservaIdParaCancelar = null;

        await cargarReservas();

    } catch (error) {

        console.error(
            'Error cancelando reserva:',
            error
        );

        status.textContent =
            error.message ||
            'Ocurrió un error al cancelar la reserva.';

        status.classList.add('error');
    }
}

// ── MODALES ──
function abrirModal(modal) {
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function cerrarModal(modal) {
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

// ── CERRAR MODAL DE CANCELACIÓN ──
document.addEventListener('click', (event) => {

  const botonCerrar =
    event.target.closest(
      '[data-action="close-cancelar-reserva"]'
    );

  if (!botonCerrar) return;

  const modal =
    document.getElementById(
      'modal-cancelar-reserva'
    );

  cerrarModal(modal);

  reservaIdParaCancelar = null;

  const motivo =
    document.getElementById(
      'motivo-cancelacion-admin'
    );

  const status =
    document.getElementById(
      'cancelacion-status'
    );

  if (motivo) {
    motivo.value = '';
  }

  if (status) {
    status.textContent = '';
    status.classList.remove('error');
  }

});

// ── DETALLE ──
async function verDetalle(id) {

  const r = reservas.find(
    x => x.id_reserva === id
  );

  if (!r) return;

  try {

    const respuesta = await fetch(
      `${API_URL}/api/reservas/${encodeURIComponent(id)}/acompanantes`,
      {
        method: "GET",
        credentials: "include"
      }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok || !datos.ok) {
      throw new Error(
        datos.mensaje ||
        "No se pudieron consultar los acompañantes."
      );
    }

    const estadoVisual =
      obtenerEstadoVisual(r);

    const cantidadPermitida =
      Number(
        datos.cantidad_permitida ??
        r.cant_acompanantes ??
        0
      );

    const acompanantes =
      datos.acompanantes || [];

    let listaAcompanantes;

    if (cantidadPermitida === 0) {

      listaAcompanantes = `
        <span class="sin-registros">
          No aplica
        </span>
      `;

    } else if (acompanantes.length === 0) {

      listaAcompanantes = `
        <span class="sin-registros">
          Sin registros todavía
        </span>
      `;

    } else {

      listaAcompanantes =
        acompanantes.map(persona => `
          <div class="acompanante-registrado">
            ${escapar(persona.nombre)}
            —
            ${escapar(persona.cuenta)}
          </div>
        `).join("");
    }


    // =======================================
    // CAMPOS DEL DETALLE
    // =======================================

    const campos = [
      ['Código', r.id_reserva],

      ['Estado', estadoVisual.texto],

      [
        'Estudiante',
        r.estudiante_nombre ||
        r.nombre_estudiante ||
        '—'
      ],

      [
        'Cuenta',
        r.estudiante_cuenta ||
        r.cuenta ||
        '—'
      ],

      [
        'Correo',
        r.estudiante_correo ||
        r.correo ||
        '—'
      ],

      [
        'Teléfono',
        r.telefono || '—'
      ],

      [
        'Espacio',
        r.espacio_nombre ||
        obtenerNombreEspacio(r.id_espacio)
      ],

      [
        'Juego',
        r.item_nombre || '—'
      ],

      [
        'Fecha',
        formatearFecha(r.fecha)
      ],

      [
        'Hora',
        `${formatear12h(
          obtenerSoloHora(r.hora_inicio)
        )} – ${formatear12h(
          obtenerSoloHora(r.hora_fin)
        )}`
      ],

      [
        'Acompañantes permitidos',
        cantidadPermitida
      ]
    ];


    // =======================================
    // SOLO SI ESTÁ CANCELADA
    // =======================================

    if (r.estado === 'cancelada') {

      campos.push(
        [
          'Cancelado por',
          r.cancelado_por === 'admin'
            ? 'Administrador'
            : r.cancelado_por === 'estudiante'
              ? 'Estudiante'
              : r.cancelado_por || '—'
        ],

        [
          'Motivo de cancelación',
          r.motivo_cancelacion || '—'
        ]
      );
    }


    // =======================================
    // MOSTRAR DETALLE
    // =======================================

    document.getElementById(
      'detalle-body'
    ).innerHTML =

      campos.map(([etiqueta, valor]) => `
        <div class="detalle-item">
          <span>${etiqueta}</span>

          <strong>
            ${escapar(String(valor))}
          </strong>
        </div>
      `).join('')

      +

      `
        <div class="detalle-item ancho">
          <span>
            Acompañantes registrados
          </span>

          <div class="lista-acompanantes">
            ${listaAcompanantes}
          </div>
        </div>

        <div class="detalle-item ancho">
          <span>
            Solicitud especial
          </span>

          <strong>
            ${escapar(
              r.solicitud_especial || '—'
            )}
          </strong>
        </div>
      `;


    new bootstrap.Modal(
      document.getElementById(
        'modalDetalle'
      )
    ).show();

  } catch (error) {

    console.error(
      "Error cargando detalle:",
      error
    );

    mostrarToast(
      error.message ||
      "No se pudo cargar el detalle de la reserva.",
      "danger"
    );

  }
}


function obtenerNombreEspacio(id) {
  const espacios = {
    1: 'Cancha de fútbol',
    2: 'Cancha de voleibol',
    3: 'Cancha de baloncesto',
    4: 'Zona Jaguar'
  };

  return espacios[Number(id)] || '—';
}


// ── FILTROS ──
function limpiarFiltros() {

  paginaActual = 1;

  document.getElementById('filtro-estado').value  = '';
  document.getElementById('filtro-espacio').value = '';
  document.getElementById('filtro-fecha').value   = '';
  document.getElementById('filtro-buscar').value  = '';

  cargarReservas();

}


// ── TOAST ──
function mostrarToast(mensaje, tipo = "danger") {

  const toast = document.getElementById("toastMensaje");

  if (!toast) {
    console.log(mensaje);
    return;
  }

  const cuerpo = toast.querySelector(".toast-body");

  cuerpo.textContent = mensaje;

  toast.className = `toast text-bg-${tipo}`;

  const bsToast = new bootstrap.Toast(toast);

  bsToast.show();

}


// ── MENU MOVIL ──
function abrirMenu() {
  document.querySelector('.sidebar-admin').classList.add('activo');
  document.getElementById('sidebar-overlay').classList.add('activo');
}

function cerrarMenu() {
  document.querySelector('.sidebar-admin').classList.remove('activo');
  document.getElementById('sidebar-overlay').classList.remove('activo');
}


async function cerrarSesion() {

  try {

    const res = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });

    const data = await res.json();

    if (data.ok) {
      window.location.href = "../../login.html";
    } else {
      mostrarToast("No se pudo cerrar la sesión.", "danger");
    }

  } catch (error) {
    console.error(error);
    mostrarToast("Error al cerrar la sesión.", "danger");
  }

}

// ── INICIO ──
document.addEventListener(
  'DOMContentLoaded',
  async () => {

    actualizarFechaTopbar();

    setInterval(
      actualizarFechaTopbar,
      60000
    );

    const sesionValida =
      await verificarAdmin();

    if (!sesionValida) {
      return;
    }

    await cargarReservas();

    document
      .getElementById('btn-confirmar-cancelacion-admin')
      ?.addEventListener(
        'click',
        confirmarCancelacionAdmin
      );

    // Auto-actualizar reservas cada 30 segundos
    setInterval(
      cargarReservas,
      30000
    );

  }
);