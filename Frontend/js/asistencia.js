const API_URL =
  "https://jaguarreservationii-production.up.railway.app";

const ASISTENCIAS_POR_PAGINA = 6;

let asistencias = [];
let paginaActual = 1;


// ── TOPBAR FECHA ──
function actualizarFechaTopbar() {

  const elemento =
    document.getElementById('topbar-fecha') ||
    document.getElementById('topbar-date');

  if (!elemento) return;

  const ahora = new Date();

  const fecha = ahora.toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const hora = ahora.toLocaleTimeString('es-HN', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const fechaFinal =
    fecha.charAt(0).toUpperCase() +
    fecha.slice(1);

  elemento.textContent =
    `${fechaFinal} · ${hora}`;
}


// ── FECHA ACTUAL ──
function obtenerFechaActual() {

  const ahora = new Date();

  const anio =
    ahora.getFullYear();

  const mes =
    String(
      ahora.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      ahora.getDate()
    ).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}


// ── FORMATO ──

// Convierte "14:30" -> "2:30 PM"
function formatear12h(hora24) {

  if (!hora24) {
    return '—';
  }

  const horaTexto =
    String(hora24).substring(0, 5);

  let [h, m] =
    horaTexto.split(':').map(Number);

  const periodo =
    h >= 12 ? 'PM' : 'AM';

  let h12 = h % 12;

  if (h12 === 0) {
    h12 = 12;
  }

  return `${h12}:${String(m).padStart(2, '0')} ${periodo}`;
}


function formatearTipoAsistencia(tipo) {

  const tipos = {
    titular: 'Titular',
    acompanante: 'Acompañante'
  };

  return tipos[tipo] || tipo || '—';
}


function obtenerEstadoAsistencia(estado) {

  const estados = {

    presente: {
      texto: 'Presente',
      clase: 'presente'
    },

    pendiente: {
      texto: 'Pendiente',
      clase: 'pendiente'
    },

    inasistencia: {
      texto: 'Inasistencia',
      clase: 'inasistencia'
    }

  };

  return estados[estado] || {
    texto: estado || 'Sin estado',
    clase: 'pendiente'
  };
}


// Evita que los datos de la base rompan el HTML
function escapar(texto) {

  const div =
    document.createElement('div');

  div.textContent =
    texto ?? '';

  return div.innerHTML;
}


// ── SESIÓN: SOLO ADMIN ──
async function verificarAdmin() {

  try {

    const res = await fetch(
      `${API_URL}/api/auth/session`,
      {
        credentials: 'include'
      }
    );

    const data =
      await res.json();

    if (
      !res.ok ||
      !data.ok ||
      data.usuario?.rol !== 'admin'
    ) {

      window.location.href =
        '../../login.html';

      return false;
    }

    const nombre =
      data.usuario.nombre ||
      'Administrador';

    const nombreElemento =
      document.getElementById(
        'usuario-nombre'
      );

    const avatarElemento =
      document.getElementById(
        'usuario-avatar'
      );

    if (nombreElemento) {
      nombreElemento.textContent =
        nombre;
    }

    if (avatarElemento) {
      avatarElemento.textContent =
        obtenerIniciales(nombre);
    }

    return true;

  } catch (error) {

    console.error(error);

    mostrarToast(
      'No se pudo conectar con el servidor.',
      'danger'
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


// ── CARGAR ASISTENCIAS ──
async function cargarAsistencias() {

  paginaActual = 1;

  const parametros =
    new URLSearchParams();

  const fecha =
    document.getElementById(
      'filtro-fecha'
    )?.value || '';

  const espacio =
    document.getElementById(
      'filtro-espacio'
    )?.value || '';

  const tipo =
    document.getElementById(
      'filtro-tipo'
    )?.value || '';

  const estado =
    document.getElementById(
      'filtro-estado'
    )?.value || '';


  if (fecha) {
    parametros.append(
      'fecha',
      fecha
    );
  }

  if (espacio) {
    parametros.append(
      'espacio',
      espacio
    );
  }

  if (tipo) {
    parametros.append(
      'tipo',
      tipo
    );
  }

  if (estado) {
    parametros.append(
      'estado',
      estado
    );
  }


  try {

    const res = await fetch(
      `${API_URL}/api/asistencia?${parametros.toString()}`,
      {
        credentials: 'include'
      }
    );

    const data =
      await res.json();

    if (!res.ok || !data.ok) {

      mostrarToast(
        data.mensaje ||
        'No se pudieron cargar las asistencias.',
        'danger'
      );

      return;
    }

    asistencias =
      data.asistencias || [];

    renderTabla();

  } catch (error) {

    console.error(
      'Error cargando asistencias:',
      error
    );

    mostrarToast(
      'No se pudo conectar con el servidor.',
      'danger'
    );
  }
}


// ── CARGAR RESUMEN ──
async function cargarResumen() {

  const fecha =
    document.getElementById('filtro-fecha')?.value ||
    obtenerFechaActual();

  try {

    const res = await fetch(
      `${API_URL}/api/asistencia/resumen?fecha=${encodeURIComponent(fecha)}`,
      { credentials: 'include' }
    );

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.mensaje || 'No se pudo cargar el resumen.');
    }

    const resumen = data.resumen || {};

    const campos = {
      'total-esperados': resumen.esperados,
      'total-presentes': resumen.presentes,
      'total-pendientes': resumen.pendientes,
      'total-inasistencias': resumen.inasistencias
    };

    Object.entries(campos).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(valor || 0);
    });

  } catch (error) {

    console.error('Error cargando resumen:', error);

    mostrarToast(
      error.message || 'No se pudo cargar el resumen de asistencia.',
      'danger'
    );
  }
}

// ── PAGINACIÓN ──
function renderPaginacion(totalPaginas) {

  const contenedor =
    document.getElementById(
      'paginacion-asistencia'
    );

  if (!contenedor) return;


  if (totalPaginas <= 1) {

    contenedor.innerHTML = '';
    contenedor.style.display =
      'none';

    return;
  }


  const botones = [];


  botones.push(`
    <button
      type="button"
      class="paginacion-btn"
      onclick="cambiarPagina(${Math.max(
        1,
        paginaActual - 1
      )})"
      ${paginaActual === 1
        ? 'disabled'
        : ''}
    >
      <i class="bi bi-chevron-left"></i>
    </button>
  `);


  for (
    let i = 1;
    i <= totalPaginas;
    i += 1
  ) {

    botones.push(`
      <button
        type="button"
        class="paginacion-btn ${
          i === paginaActual
            ? 'activa'
            : ''
        }"
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
      onclick="cambiarPagina(${Math.min(
        totalPaginas,
        paginaActual + 1
      )})"
      ${paginaActual === totalPaginas
        ? 'disabled'
        : ''}
    >
      <i class="bi bi-chevron-right"></i>
    </button>
  `);


  contenedor.innerHTML =
    botones.join('');

  contenedor.style.display =
    'flex';
}


function cambiarPagina(pagina) {

  paginaActual =
    Math.max(
      1,
      pagina
    );

  renderTabla();
}


// ── TABLA ──
function renderTabla() {

  const campoBuscar =
    document.getElementById(
      'filtro-buscar'
    );

  const busqueda =
    campoBuscar
      ? campoBuscar.value
          .trim()
          .toLowerCase()
      : '';


  // Búsqueda por nombre, cuenta o reserva
  const visibles =
    busqueda
      ? asistencias.filter(a => {

          const nombre =
            String(
              a.estudiante_nombre || ''
            ).toLowerCase();

          const cuenta =
            String(
              a.estudiante_cuenta || ''
            ).toLowerCase();

          const reserva =
            String(
              a.id_reserva || ''
            ).toLowerCase();

          return (
            nombre.includes(busqueda) ||
            cuenta.includes(busqueda) ||
            reserva.includes(busqueda)
          );
        })

      : asistencias;


  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        visibles.length /
        ASISTENCIAS_POR_PAGINA
      )
    );


  paginaActual =
    Math.min(
      paginaActual,
      totalPaginas
    );


  const inicio =
    (paginaActual - 1) *
    ASISTENCIAS_POR_PAGINA;


  const paginaActualItems =
    visibles.slice(
      inicio,
      inicio +
      ASISTENCIAS_POR_PAGINA
    );


  const body =
    document.getElementById(
      'tabla-body'
    );

  const vacia =
    document.getElementById(
      'tabla-vacia'
    );


  if (!body || !vacia) {
    return;
  }


  vacia.style.display =
    visibles.length
      ? 'none'
      : 'block';


  body.innerHTML =
    paginaActualItems.map(a => {

      const estadoVisual =
        obtenerEstadoAsistencia(
          a.estado_asistencia
        );


      const horario =
        a.hora_inicio &&
        a.hora_fin

          ? `${formatear12h(
              a.hora_inicio
            )} – ${formatear12h(
              a.hora_fin
            )}`

          : '—';


      return `
        <tr>

          <td class="celda-hora">

            ${
              a.hora_entrada
                ? formatear12h(
                    a.hora_entrada
                  )
                : '—'
            }

          </td>


          <td class="celda-persona">

            <strong>
              ${escapar(
                a.estudiante_nombre ||
                'Sin nombre'
              )}
            </strong>

            <small>
              ${escapar(
                a.estudiante_cuenta ||
                '—'
              )}
            </small>

          </td>


          <td>
            ${escapar(
              formatearTipoAsistencia(
                a.tipo
              )
            )}
          </td>


          <td class="celda-id">
            ${escapar(
              a.id_reserva || '—'
            )}
          </td>


          <td>
            ${escapar(
              a.espacio_nombre ||
              '—'
            )}
          </td>


          <td class="celda-hora">
            ${horario}
          </td>


          <td>

            ${
              a.guardia_nombre
                ? escapar(
                    a.guardia_nombre
                  )
                : '—'
            }

          </td>


          <td>

            <span
              class="badge-asistencia ${estadoVisual.clase}"
            >
              ${estadoVisual.texto}
            </span>

          </td>

        </tr>
      `;

    }).join('');


  renderPaginacion(
    totalPaginas
  );
}


// ── FILTROS ──
async function aplicarFiltros() {

  paginaActual = 1;

  await Promise.all([
    cargarAsistencias(),
    cargarResumen()
  ]);
}


async function limpiarFiltros() {

  paginaActual = 1;

  const fecha =
    document.getElementById(
      'filtro-fecha'
    );

  const espacio =
    document.getElementById(
      'filtro-espacio'
    );

  const tipo =
    document.getElementById(
      'filtro-tipo'
    );

  const estado =
    document.getElementById(
      'filtro-estado'
    );

  const buscar =
    document.getElementById(
      'filtro-buscar'
    );


  if (fecha) {
    fecha.value =
      obtenerFechaActual();
  }

  if (espacio) {
    espacio.value = '';
  }

  if (tipo) {
    tipo.value = '';
  }

  if (estado) {
    estado.value = '';
  }

  if (buscar) {
    buscar.value = '';
  }


  await Promise.all([
    cargarAsistencias(),
    cargarResumen()
  ]);
}


// ── TOAST ──
function mostrarToast(
  mensaje,
  tipo = 'danger'
) {

  const toast =
    document.getElementById(
      'toastMensaje'
    );

  if (!toast) {

    console.log(mensaje);

    return;
  }

  const cuerpo =
    toast.querySelector(
      '.toast-body'
    );

  cuerpo.textContent =
    mensaje;

  toast.className =
    `toast text-bg-${tipo}`;

  const bsToast =
    new bootstrap.Toast(
      toast
    );

  bsToast.show();
}


// ── MENÚ MÓVIL ──
function abrirMenu() {

  document
    .querySelector(
      '.sidebar-admin'
    )
    ?.classList.add(
      'activo'
    );

  document
    .getElementById(
      'sidebar-overlay'
    )
    ?.classList.add(
      'activo'
    );
}


function cerrarMenu() {

  document
    .querySelector(
      '.sidebar-admin'
    )
    ?.classList.remove(
      'activo'
    );

  document
    .getElementById(
      'sidebar-overlay'
    )
    ?.classList.remove(
      'activo'
    );
}


// ── CERRAR SESIÓN ──
async function cerrarSesion() {

  try {

    const res =
      await fetch(
        `${API_URL}/api/auth/logout`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

    const data =
      await res.json();

    if (data.ok) {

      window.location.href =
        '../../login.html';

    } else {

      mostrarToast(
        'No se pudo cerrar la sesión.',
        'danger'
      );
    }

  } catch (error) {

    console.error(error);

    mostrarToast(
      'Error al cerrar la sesión.',
      'danger'
    );
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


    // Mostrar por defecto la fecha actual
    const filtroFecha =
      document.getElementById(
        'filtro-fecha'
      );

    if (
      filtroFecha &&
      !filtroFecha.value
    ) {

      filtroFecha.value =
        obtenerFechaActual();
    }


    await Promise.all([
      cargarAsistencias(),
      cargarResumen()
    ]);


    document
      .getElementById(
        'filtro-fecha'
      )
      ?.addEventListener(
        'change',
        aplicarFiltros
      );


    document
      .getElementById(
        'filtro-espacio'
      )
      ?.addEventListener(
        'change',
        aplicarFiltros
      );


    document
      .getElementById(
        'filtro-tipo'
      )
      ?.addEventListener(
        'change',
        aplicarFiltros
      );


    document
      .getElementById(
        'filtro-estado'
      )
      ?.addEventListener(
        'change',
        aplicarFiltros
      );


    // Buscar sin volver a consultar el servidor
    document
      .getElementById(
        'filtro-buscar'
      )
      ?.addEventListener(
        'input',
        () => {

          paginaActual = 1;

          renderTabla();
        }
      );

  }
);


// ── ACTUALIZACIÓN AUTOMÁTICA ──
setInterval(
  async () => {

    const usuario =
      document.getElementById(
        'usuario-nombre'
      );

    if (!usuario) {
      return;
    }

    await Promise.all([
      cargarAsistencias(),
      cargarResumen()
    ]);

  },
  30000
);