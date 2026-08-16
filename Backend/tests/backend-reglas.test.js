const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarFechaISO, fechaActualHondurasISO } = require('../utils/fechas');
const { resolverCamposEstudiante } = require('../utils/excelImport');

test('normalizarFechaISO convierte fechas a formato ISO consistente', () => {
  assert.equal(normalizarFechaISO('2026-8-15'), '2026-08-15');
  assert.equal(normalizarFechaISO('2026/08/15'), '2026-08-15');
  assert.equal(normalizarFechaISO(new Date(2026, 7, 15)), '2026-08-15');
});

test('resolverCamposEstudiante usa cabeceras cuando existen y soporta fallback por índices', () => {
  const fila = ['2026001', 'Ana García', '0801199912345', 'ana@ejemplo.com', 'Ingeniería', '2026', 'Activo'];
  const encabezados = ['cuenta', 'nombre', 'dni', 'correo', 'carrera', 'periodo', 'estado'];

  const datos = resolverCamposEstudiante(fila, encabezados);

  assert.equal(datos.cuenta, '2026001');
  assert.equal(datos.nombre, 'Ana García');
  assert.equal(datos.dni, '0801199912345');
  assert.equal(datos.correo, 'ana@ejemplo.com');
  assert.equal(datos.carrera, 'Ingeniería');

  const filaSinCabeceras = ['2026002', 'Luis', '0801199912346', 'luis@ejemplo.com', 'Contaduría'];
  const datosFallback = resolverCamposEstudiante(filaSinCabeceras, []);

  assert.equal(datosFallback.cuenta, '2026002');
  assert.equal(datosFallback.nombre, 'Luis');
  assert.equal(datosFallback.dni, '0801199912346');
});

test('fechaActualHondurasISO devuelve un valor en formato ISO', () => {
  const hoy = fechaActualHondurasISO();
  assert.match(hoy, /^\d{4}-\d{2}-\d{2}$/);
});
