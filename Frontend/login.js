
const $ = (s) => document.querySelector(s);

//LO NUEVO
const API_URL = 'http://localhost:3000';
    
let tipo = 'estudiante';

// Campos que se muestran según el tipo de usuario
const FIELDS = {
  estudiante: `
    <div class="field">
      <label>Número de cuenta</label>
      <div class="iwrap"><i class="ti ti-id ii"></i>
        <input id="lg-a" inputmode="numeric" maxlength="11" placeholder="Ej. 42411126" autocomplete="username"></div>
    </div>
    <div class="field">
      <label>Últimos 5 dígitos del DNI</label>
      <div class="iwrap"><i class="ti ti-lock ii"></i>
        <input id="lg-b" type="password" inputmode="numeric" maxlength="5" placeholder="Últimos 5 dígitos" autocomplete="current-password"></div>
    </div>`,
  admin: `
    <div class="field">
      <label>Correo institucional</label>
      <div class="iwrap"><i class="ti ti-mail ii"></i>

        <input id="lg-a" type="email" placeholder="correo@unitec.edu" autocomplete="username"></div>
    </div>
    <div class="field">
      <label>Contraseña</label>
      <div class="iwrap"><i class="ti ti-lock ii"></i>
        <input id="lg-b" type="password" placeholder="Contraseña" autocomplete="current-password"></div>
    </div>`,
  guardia: `
    <div class="field">
      <label>Usuario</label>
      <div class="iwrap"><i class="ti ti-user ii"></i>
        <input id="lg-a" placeholder="Usuario de guardia" autocomplete="username"></div>
    </div>
    <div class="field">
      <label>Contraseña</label>
      <div class="iwrap"><i class="ti ti-lock ii"></i>
        <input id="lg-b" type="password" placeholder="Contraseña" autocomplete="current-password"></div>
    </div>`
};

const HINTS = {
  estudiante: `<b>Estudiante:</b> ingresa número de cuenta y últimos 5 dígitos del DNI`,
  admin: `<b>Administrador:</b> ingresa correo institucional y contraseña`,
  guardia: `<b>Guardia:</b> ingresa usuario y contraseña`
};

const ENDPOINTS = {
  estudiante: '/api/auth/login/estudiante',
  admin: '/api/auth/login/admin',
  guardia: '/api/auth/login/guardia'
};

const REDIRECTS = {
  estudiante: 'usuario/inicio.html',
  // estudiante: '/login/estudiante',
  admin:'admin/dashboard.html',
  guardia:'guardia/panel.html'
}

function setTipo(t) {
  tipo = t;
  $('#ut-est').classList.toggle('active', t === 'estudiante');
  $('#ut-coord').classList.toggle('active', t === 'admin');
  $('#ut-guard').classList.toggle('active', t === 'guardia');
  $('#loginFields').innerHTML = FIELDS[t];
  $('#credsHint').innerHTML = HINTS[t];
}

function toast(msg, clase) {
  const t = $('#toast');
  t.className = '';
  t.textContent = msg;
  if (clase) t.classList.add(clase);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

function setLoading(isLoading) {
  const btn = document.querySelector('.btn-cta');
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? '<i class="ti ti-loader-2"></i> Validando...'
    : '<i class="ti ti-login-2"></i> Ingresar';
}

function buildPayload(a, b) {
  if (tipo === 'estudiante') return { cuenta: a, dni: b };
  if (tipo === 'admin') return { correo: a, contrasena: b };
  return { usuario: a, contrasena: b };
}

function validarCampos(a, b) {
  if (!a || !b) return 'Completa todos los campos.';

  if (tipo === 'estudiante') {
    if (!/^\d+$/.test(a)) return 'El número de cuenta solo debe contener números.';
    if (!/^\d{5}$/.test(b)) return 'El DNI debe contener exactamente los últimos 5 dígitos.';
  }

  if (tipo === 'admin' && !a.includes('@')) {
    return 'Ingresa un correo institucional válido.';
  }

  return null;
}

$('#ut-est').addEventListener('click', () => setTipo('estudiante'));
$('#ut-coord').addEventListener('click', () => setTipo('admin'));
$('#ut-guard').addEventListener('click', () => setTipo('guardia'));

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const a = $('#lg-a').value.trim();
  const b = $('#lg-b').value.trim();
  const error = validarCampos(a, b);

  if (error) {
    toast(error, 'error');
    return;
  }

  try {
    setLoading(true);

    const response = await fetch(`${API_URL}${ENDPOINTS[tipo]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(buildPayload(a, b))
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      toast(data.mensaje || 'Credenciales incorrectas.', 'error');
      return;
    }

    toast('Acceso correcto. Redirigiendo...', 'ok');
    setTimeout(() => {
      window.location.href = REDIRECTS[tipo];
    }, 700);

  } catch (err) {
    toast('No se pudo conectar con el servidor. Verifica que el backend esté activo.', 'error');
  } finally {
    setLoading(false);
  }
});

setTipo('estudiante');