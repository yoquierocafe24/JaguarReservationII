const MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS    = ['L','M','M','J','V','S','D'];
const DIAS_SM = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const TODAY   = new Date();

let currentYear  = TODAY.getFullYear();
let currentMonth = TODAY.getMonth();
let fechaSel     = null;
let horaSel      = null;
let bloqueosCalendario = [];

// ── Espacio seleccionado desde inicio.html ──
const espacioLabels = {
  futbol:      'Fútbol',
  voleibol:    'Voleibol',
  baloncesto:  'Baloncesto',
  zona_jaguar: 'Zona Jaguar'
};

const espacio = sessionStorage.getItem('espacioSeleccionado') || 'futbol';
document.getElementById('titulo-espacio').textContent = espacioLabels[espacio] || espacio;

if(espacio === "zona_jaguar"){

    document
    .getElementById("grupo-juego")
    .style.display = "block";

}else{

    document
    .getElementById("grupo-juego")
    .style.display = "none";

}

// ── Topbar fecha ──
document.getElementById('topbar-fecha').textContent =
  DIAS_SM[TODAY.getDay()] + ' ' + TODAY.getDate() + ' de ' + MESES[TODAY.getMonth()] + ' ' + TODAY.getFullYear();


  
function obtenerSoloFecha(fecha) {
  if (!fecha) return '';
  return String(fecha).substring(0, 10);
}

async function cargarBloqueosCalendario() {

  try {

    const primerDia =
      `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-01`;

    const ultimoDiaMes =
      new Date(currentYear, currentMonth + 1, 0).getDate();

    const ultimoDia =
      `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(ultimoDiaMes).padStart(2,'0')}`;

    const idEspacio = espacios[espacio];

    const url =
      `${API_URL}/api/calendario/bloqueos?fecha_inicio=${primerDia}&fecha_fin=${ultimoDia}&espacio=${idEspacio}`;

    const res = await fetch(url, {
      credentials: 'include'
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(
        data.mensaje || 'No se pudieron consultar los bloqueos.'
      );
    }

    bloqueosCalendario = data.bloqueos || [];

  } catch (error) {

    console.error(
      'Error cargando bloqueos del calendario:',
      error
    );

    bloqueosCalendario = [];
  }
}

function esDiaBloqueadoCompleto(fecha) {

  return bloqueosCalendario.some(bloqueo => {

    const inicio =
      obtenerSoloFecha(bloqueo.fecha_inicio);

    const fin =
      obtenerSoloFecha(bloqueo.fecha_fin);

    return (
      Number(bloqueo.dia_completo) === 1 &&
      fecha >= inicio &&
      fecha <= fin
    );
  });
}

function esHorarioBloqueado(fecha, horario) {

  const [inicioHorario, finHorario] = horario.split('–');

  return bloqueosCalendario.some(bloqueo => {

    const fechaInicio = obtenerSoloFecha(bloqueo.fecha_inicio);
    const fechaFin = obtenerSoloFecha(bloqueo.fecha_fin);

    // El bloqueo no corresponde a este día
    if (fecha < fechaInicio || fecha > fechaFin) {
      return false;
    }

    // Si es día completo, todo está bloqueado
    if (Number(bloqueo.dia_completo) === 1) {
      return true;
    }

    const inicioBloqueo =
      String(bloqueo.hora_inicio || '').substring(0, 5);

    const finBloqueo =
      String(bloqueo.hora_fin || '').substring(0, 5);

    if (!inicioBloqueo || !finBloqueo) {
      return false;
    }

    // Detectar si los horarios se cruzan
    return (
      inicioHorario < finBloqueo &&
      finHorario > inicioBloqueo
    );
  });
}

// ── CALENDARIO ──
function renderCal() {

  document.getElementById('cal-mes').textContent =
    MESES[currentMonth] + ' ' + currentYear;

  document.getElementById('cal-dow').innerHTML =
    DIAS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  let startDow = new Date(currentYear, currentMonth, 1).getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const total = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Espacios vacíos antes del primer día
  for (let i = 0; i < startDow; i++) {
    grid.appendChild(document.createElement('div'));
  }

  // Días del mes
  for (let d = 1; d <= total; d++) {

    const cell = document.createElement('div');

    const fecha = new Date(currentYear, currentMonth, d);

    const fechaActual =
      `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const esHoy =
      fecha.toDateString() === TODAY.toDateString();

    const esPasado =
      fecha < new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

    const esDomingo =
      fecha.getDay() === 0;

      const esBloqueado =
  esDiaBloqueadoCompleto(fechaActual);

    // Comparación correcta
    const esSel = fechaSel === fechaActual;

    cell.className = 'cal-dia';

    if (esPasado || esDomingo || esBloqueado) {
  cell.classList.add('bloqueado');
} else if (esSel) {
      cell.classList.add('selected');
    } else if (esHoy) {
      cell.classList.add('hoy');
    }

    cell.textContent = d;

    if (!esPasado && !esDomingo && !esBloqueado) {
  cell.onclick = () =>
    seleccionarFecha(currentYear, currentMonth, d);
}

    grid.appendChild(cell);
  }

}

async function cambiarMes(dir) {
  currentMonth += dir;

  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }

  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }

  fechaSel = null;
  horaSel = null;

  await cargarBloqueosCalendario();
  renderCal();
}



// ── HORAS ──

// Convierte "14:00" -> "2:00 PM"
function formatear12h(hora24) {
  let [h, m] = hora24.split(':').map(Number);
  const periodo = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2,'0')} ${periodo}`;
}

async function cargarHoras() {
  const wrap = document.getElementById('horas-wrap');
  const horas = ['08:00–09:00','09:00–10:00','10:00–11:00',
                 '14:00–15:00','15:00–16:00','17:00–18:00','19:00–20:00'];

  wrap.innerHTML = '<p style="font-size:13px;color:var(--subtexto)">Cargando horarios...</p>';

  // No se necesita nada aquí — el chequeo de 24h
  // reemplaza al viejo "yaPaso" (que solo miraba
  // el mismo día). Se calcula por cada horario más abajo.

// Consulta al backend qué horas ya están ocupadas o agotadas
let horasOcupadas = [];

// Horas donde EL PROPIO ESTUDIANTE ya tiene otra reserva,
// sin importar el espacio (se avisa distinto al usuario)
let horasPropiasOcupadas = [];

try {

  let url;

  // =========================================
  // ZONA JAGUAR
  // Se bloquea solamente cuando se agotan
  // todas las unidades del juego seleccionado
  // =========================================
  if (espacio === "zona_jaguar") {

    const idItem = selectJuego?.value;

    if (!idItem) {

      wrap.innerHTML = `
        <p style="font-size:13px;color:var(--subtexto)">
          Selecciona primero un juego para consultar los horarios disponibles.
        </p>
      `;

      return;
    }

   url =
  `${API_URL}/api/inventario/horarios-agotados?fecha=${fechaSel}&id_item=${idItem}`;

  } else {

    // =========================================
    // CANCHAS
    // Una reserva sí bloquea el espacio completo
    // =========================================
   url =
  `${API_URL}/api/reservas/horarios/consultar?espacio=${espacios[espacio]}&fecha=${fechaSel}`;
  }

  // Se consultan en paralelo:
  // 1) la disponibilidad del espacio/juego (url de arriba)
  // 2) las horas donde el ESTUDIANTE ya tiene otra reserva
  //    ese día, sin importar el espacio
  const [resEspacio, resPropias] = await Promise.all([
    fetch(url, { credentials: "include" }),
    fetch(
      `${API_URL}/api/reservas/mis-horarios?fecha=${fechaSel}`,
      { credentials: "include" }
    )
  ]);

  const data = await resEspacio.json();
  const dataPropias = await resPropias.json();

  console.log("RESPUESTA DE HORARIOS:", data);
  console.log("MIS HORARIOS OCUPADOS:", dataPropias);

  if (!resEspacio.ok || !data.ok) {
    throw new Error(
      data.mensaje || "No se pudieron consultar los horarios."
    );
  }

  if (resPropias.ok && dataPropias.ok) {
    horasPropiasOcupadas = dataPropias.horasOcupadas || [];
  }

  if (espacio === "zona_jaguar") {

    // La nueva ruta devuelve horarios_agotados
    horasOcupadas = (data.horarios_agotados || []).map(horario => {

      const inicio =
        String(horario.hora_inicio).slice(0, 5);

      const fin =
        String(horario.hora_fin).slice(0, 5);

      return `${inicio}–${fin}`;

    });

  } else {

    // La ruta actual de canchas devuelve horasOcupadas
    horasOcupadas = data.horasOcupadas || [];

  }

} catch (error) {

  console.error(
    "Error al consultar horarios:",
    error
  );

  mostrarToast(
    "No se pudieron consultar los horarios disponibles.",
    "danger"
  );

}

  wrap.innerHTML = horas.map(h => {

    const [horaInicioStr, horaFinStr] = h.split('–');

    const estaOcupada = horasOcupadas.includes(h);
    const estaBloqueada = esHorarioBloqueado(fechaSel, h);
    const esPropiaOcupada = horasPropiasOcupadas.includes(h);

    // Texto visible con AM/PM
    const textoVisible = `${formatear12h(horaInicioStr)} – ${formatear12h(horaFinStr)}`;

    // Regla de 24h de anticipación (mismo cálculo que el
    // backend, con el offset de Honduras explícito para
    // no depender de la zona horaria del navegador).
    // Cubre tanto horas que ya pasaron HOY como horas
    // de MAÑANA que igual caen dentro de las próximas 24h.
    const fechaHoraSlot = new Date(`${fechaSel}T${horaInicioStr}:00-06:00`);
    const horasFaltantes = (fechaHoraSlot - new Date()) / (1000 * 60 * 60);
    const noCumple24h = horasFaltantes < 24;

   if (noCumple24h) {
  return `
    <button class="hora-chip pasada" disabled title="Debes reservar con al menos 24 horas de anticipación">
      ${textoVisible}
    </button>
  `;
}

if (estaBloqueada) {
  return `
    <button class="hora-chip ocupada" disabled title="Horario bloqueado por administración">
      ${textoVisible}
    </button>
  `;
}

// Ya tiene otra reserva a esta hora (en cualquier espacio) —
// se avisa ANTES de enviar, no hasta el final del formulario
if (esPropiaOcupada) {
  return `
    <button class="hora-chip ocupada" disabled title="Ya tienes una reserva a esta hora">
      ${textoVisible}
    </button>
  `;
}

if (estaOcupada) {
  return `
    <button class="hora-chip ocupada" disabled title="Ese horario ya está reservado">
      ${textoVisible}
    </button>
  `;
}

return `
  <button class="hora-chip" onclick="seleccionarHora(this,'${h}')">
    ${textoVisible}
  </button>`;

}).join('');
}
function seleccionarHora(boton, hora) {

    horaSel = hora;

    // quitar selección anterior
    document.querySelectorAll(".hora-chip").forEach(btn => {
        btn.classList.remove("seleccionada");
    });

    // marcar la seleccionada
    boton.classList.add("seleccionada");

    console.log("Hora seleccionada:", horaSel);
}


async function seleccionarFecha(y, m, d) {
  fechaSel = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  horaSel  = null;
  renderCal();
  await cargarHoras();
}

// ── ENVIAR RESERVA ──

const espacios = {
  futbol: 1,
  baloncesto: 2,
  voleibol: 3,
  zona_jaguar: 4
};


async function enviarReserva() {

    const telefono = document.getElementById('campo-telefono').value.trim();
    const solicitud = document.getElementById('campo-solicitud').value.trim();
    const cantAcompanantes = parseInt(document.getElementById('campo-acompanantes').value) || 0;

  
    if (!fechaSel) {
        mostrarToast("Por favor selecciona una fecha.", "danger");
        return;
    }

    if (!horaSel) {
        mostrarToast("Por favor selecciona un horario.", "danger");
        return;
    }

      if (
    espacio === "zona_jaguar" &&
    !document.getElementById("juego").value
) {

    mostrarToast(
        "Seleccione un juego.",
        "danger"
    );

    return;
}


   if (!telefono) {
    mostrarToast("Por favor ingresa un teléfono.", "danger");
    return;
}

if (!/^\d{8}$/.test(telefono)) {
    mostrarToast("El teléfono debe tener exactamente 8 dígitos.", "danger");
    return;
}

    const [horaInicio, horaFin] = horaSel.split("–");

    const body = {

    id_espacio: espacios[espacio],

    id_item:
        espacio === "zona_jaguar"
            ? document.getElementById("juego").value
            : null,

    fecha: fechaSel,

    hora_inicio: horaInicio,

    hora_fin: horaFin,

    telefono: telefono,

    solicitud_especial: solicitud,

    cant_acompanantes: cantAcompanantes

};

    try {

       const res = await fetch(`${API_URL}/api/reservas`, {
            method: "POST",

            credentials: "include",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(body)

        });

        const data = await res.json();

        
      if (data.ok) {

    // Guardamos la información para confirmar.html
    const reserva = {
        id_reserva: data.id_reserva || null,

       // Será true si el backend devuelve tiene_qr
    // o si devuelve directamente un qr_token.
    tiene_qr:
        data.tiene_qr === true ||
        Boolean(data.qr_token),

    qr_token:
        data.qr_token || null,

    cant_acompanantes:
        cantAcompanantes,

            tipo_reserva:
        "individual",

        nombre: document.getElementById("campo-nombre").value,

        cuenta: document.getElementById("campo-cuenta").value,

        espacio: espacioLabels[espacio],

        juego:
         espacio === "zona_jaguar" && selectJuego
        ? selectJuego.options[selectJuego.selectedIndex].text
        : null,

        fecha: fechaSel,

        horaInicio: horaInicio,

        horaFin: horaFin,

        codigo: data.codigo || data.id_reserva ||  "0000"

    };
    console.log("RESERVA GUARDADA:", reserva);

    sessionStorage.setItem(
        "ultimaReserva",
        JSON.stringify(reserva)
    );

    window.location.href = "confirmar.html";

} else {

    mostrarToast(
        data.mensaje || "No se pudo crear la reserva",
        "danger"
    );

}

    } catch (error) {

        console.error(error);

        mostrarToast("No se pudo conectar con el servidor.", "danger");

    }

}

function mostrarToast(mensaje, tipo="danger") {

    const toast = document.getElementById("toastMensaje");

    if(!toast){
        console.log(mensaje);
        return;
    }

    const cuerpo = toast.querySelector(".toast-body");
    cuerpo.textContent = mensaje;

    toast.className = 
    `toast text-bg-${tipo}`;

    const bsToast = new bootstrap.Toast(toast);

    bsToast.show();

}
function abrirMenu(){
    document .querySelector(".sidebar") .classList.add("activo");
    document .querySelector(".overlay") .classList.add("activo");
}



function cerrarMenu(){
    document .querySelector(".sidebar") .classList.remove("activo");
    document .querySelector(".overlay") .classList.remove("activo");
}

async function cargarJuegos() {
    try {
        const respuesta = await fetch(
    `${API_URL}/api/inventario/juegos`,
            {
                credentials: "include"
            }
        );

        const data = await respuesta.json();

        const opciones = data.juegos.map(juego => ({
            value: String(juego.id_item),
            label: juego.nombre
        }));

        if (choicesJuego) {
            choicesJuego.clearChoices();
            choicesJuego.setChoices(
                [{ value: "", label: "Seleccione un juego", selected: true, disabled: false }, ...opciones],
                'value',
                'label',
                true
            );
        }

    } catch (error) {
        console.error(error);
        mostrarToast("No se pudieron cargar los juegos.", "danger");

    }

}


async function cerrarSesion() {
    try {

        const res = await fetch(`${API_URL}/api/auth/logout`, {

            method: "POST",
            credentials: "include"

        });

        const data = await res.json();

        if (data.ok) {

            // Redirige al login
            window.location.href = "../../login.html";

        } else {

            mostrarToast("No se pudo cerrar la sesión.", "danger");

        }

    } catch (error) {

        console.error(error);

        mostrarToast("Error al cerrar la sesión.", "danger");
    }

}

/* ======================================
   ADVERTENCIA DE ACOMPAÑANTES
====================================== */

function verificarCantidadAcompanantes() {

    const input = document.getElementById("campo-acompanantes");
    const advertencia = document.getElementById("advertencia-acompanantes");

    if (!input || !advertencia) return;

    const cantidad = Number(input.value) || 0;

    // Umbral de advertencia (NO es un límite)
    const UMBRAL_ADVERTENCIA = 15;

    if (cantidad >= UMBRAL_ADVERTENCIA) {
        advertencia.hidden = false;
    } else {
        advertencia.hidden = true;
    }

}

const campoAcompanantes =
    document.getElementById("campo-acompanantes");

if (campoAcompanantes) {

    campoAcompanantes.addEventListener(
        "input",
        verificarCantidadAcompanantes
    );

    verificarCantidadAcompanantes();

}





// Solo permite números en el campo de teléfono, máximo 8 dígitos
document.getElementById('campo-telefono').addEventListener('input', function(e) {
  // Elimina cualquier caracter que no sea número
  let valor = e.target.value.replace(/\D/g, '');
  // Limita a 8 dígitos máximo
  if (valor.length > 8) {
    valor = valor.slice(0, 8);
  }
  e.target.value = valor;
});


// Iniciar calendario
async function iniciarCalendario() {
  await cargarBloqueosCalendario();
  renderCal();
}

iniciarCalendario();

// Inicializar Choices.js en el select de juego y cargar los juegos
let choicesJuego = null;
const selectJuego = document.getElementById('juego');

if (selectJuego) {

  choicesJuego = new Choices(selectJuego, {
    searchEnabled: false,
    itemSelectText: '',
    shouldSort: false,
    placeholder: true,
  });

}

if (selectJuego) {

  selectJuego.addEventListener("change", async () => {

    horaSel = null;

    if (fechaSel) {
      await cargarHoras();
    }

  });

}

// Solo cargar juegos si el espacio es zona_jaguar
if (espacio === "zona_jaguar") {
  cargarJuegos();
}