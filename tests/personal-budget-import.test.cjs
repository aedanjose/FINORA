'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const P = require('../assets/js/personal-budget.js'), I = require('../assets/js/personal-budget-import.js');
const X = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const header = ['Fecha', 'Semana', 'Desde (lunes)', 'Hasta (domingo)', 'Tipo de movimiento', 'Categoría', 'Descripción', 'Monto', 'Prioridad', 'Medio', 'Observación'];
const row = (type, amount, date = '2026-08-29', extra = {}) => {
  const values = [date, 5, '2026-08-24', '2026-08-30', type, type === 'Gasto' ? 'Alimentación' : type === 'Ahorro' ? 'Meta personal' : 'Ingreso mensual', 'Registro ' + type, amount, 'Necesidad', 'Efectivo', ''];
  for (const [key, value] of Object.entries(extra)) values[Number(key)] = value;
  return values;
};
function workbook({ detail = [row('Ingreso', 3000), row('Gasto', 2575), row('Ahorro', 240)], initial, projection, sheets = true } = {}) {
  const w = X.utils.book_new();
  if (sheets) X.utils.book_append_sheet(w, X.utils.aoa_to_sheet(initial || [['Inicio'], ['Costo de la meta:', 3500], ['Meta al final del semestre:', 'Ahorro personal'], ['Total de ingresos:', 3000], ['Total de gastos:', 2575], ['Ahorro para la meta:', 240], ['Saldo disponible:', 185]]), 'Inicio y meta');
  X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Registro semanal'], [], header, ...detail]), 'Registro semanal');
  if (sheets) {
    X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Ingresos', 'Gastos', 'Ahorro meta'], [3000, 2575, 240], [3000, 2575, 240]]), 'Seguimiento');
    X.utils.book_append_sheet(w, X.utils.aoa_to_sheet(projection || [['Tipo de proyección:', 'Real actual'], ['Categoría', 'Monto al corte'], ['Alimentación', 2575]]), 'Presupuesto proyectado');
    X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Tipo', 'Categoría', 'Prioridad'], ['Ingreso', 'Personalizada', 'Necesidad']]), 'Listas');
  }
  return w;
}
const parse = w => I.read(X.write(w, { bookType: 'xlsx', type: 'buffer' }), 'personal.xlsx', X);
const report = options => parse(workbook(options));
const preview = r => I.preview(r, P.blank());
const storeFixture = initial => {
  const data = new Map([['finora:casos:v1', 'no cambiar']]); if (initial) data.set(P.STORAGE_KEY, JSON.stringify(initial));
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  return { data, storage, store: P.createStore(storage) };
};

test('Cinco hojas, registros como fuente única, C$185 y meta 6.86%, sin convertir ejecución en plan', () => {
  const r = report(), p = preview(r), o = P.overview(p.state, '2026-08');
  assert.deepEqual(r.sheets.map(s => s.role), ['inicio', 'registro', 'seguimiento', 'proyeccion', 'listas']);
  assert.equal(p.added, 3); assert.equal(p.totals.income, 3000); assert.equal(p.totals.expense, 2575); assert.equal(p.totals.savingBalance, 240); assert.equal(p.totals.available, 185);
  assert.equal(o.goal.percent.toFixed(2), '6.86'); assert.equal(p.state.budgets, undefined); assert.ok(p.warnings.some(w => w.includes('ejecución real')));
});
test('Encabezados movidos, columnas reordenadas, acentos y categorías nuevas', () => {
  const w = workbook({ sheets: false }), original = X.utils.sheet_to_json(w.Sheets['Registro semanal'], { header: 1 });
  const rows = original.map(r => [...r].reverse()); rows.unshift(['Título adicional'], [], []);
  w.Sheets['Registro semanal'] = X.utils.aoa_to_sheet(rows);
  assert.equal(preview(parse(w)).totals.available, 185);
});
test('Excluye subtotales y saldo; no importa filas vacías ni semanas prellenadas', () => {
  const r = report({ detail: [row('Ingreso', 100), ['MES 1', null, null, null, null, null, 'TOTAL GASTADO', 100], [null, null, null, null, null, null, 'Saldo disponible', 100], [], [null, 8]] });
  assert.equal(r.entries.length, 1); assert.equal(r.ignored, 3); assert.equal(preview(r).totals.available, 100);
});
test('Fechas ISO, dd/mm/aaaa, serial Excel y centavos en córdobas', () => {
  const r = report({ detail: [row('Ingreso', 'C$ 1,500.25', '31/12/2026'), row('Gasto', '1.234,50', '2027-01-01'), row('Reserva', '0,05', 46387)] });
  const p = preview(r); assert.equal(p.totals.income, 1500.25); assert.equal(p.totals.expense, 1234.5); assert.equal(p.totals.reserve, .05);
  assert.equal(p.totals.available, 265.7); assert.equal(r.entries[0].movement.date, '2026-12-31');
});
test('Calendario Excel 1904 se conserva sin desplazar los períodos', () => {
  const w = workbook({ detail: [row('Ingreso', 10, 44800)], sheets: false }); w.Workbook = { WBProps: { date1904: true } };
  const expected = X.SSF.parse_date_code(44800, { date1904: true });
  assert.equal(parse(w).entries[0].movement.date, `${expected.y}-${String(expected.m).padStart(2, '0')}-${String(expected.d).padStart(2, '0')}`);
});
test('Filas ambiguas se bloquean hasta corregir o excluir; no inventa prioridades', () => {
  const r = report({ detail: [row('Ingreso', 100), row('Gasto', 20, '2026-08-29', { 8: '' }), row('X', 10)] });
  assert.equal(r.entries.filter(e => e.issue).length, 2); assert.throws(() => preview(r), /fila/);
  r.entries[1].movement.priority = 'want'; r.entries[1].issue = ''; r.entries[2].excluded = true;
  assert.equal(preview(r).totals.expense, 20);
});
test('Importes cero, vacíos, negativos, moneda desconocida y fechas inexistentes se señalan', () => {
  for (const [value, date] of [[0, '2026-08-01'], ['', '2026-08-01'], [-1, '2026-08-01'], ['$50', '2026-08-01'], [2, '2026-02-30'], ['1.234', '2026-08-01']]) {
    const r = report({ detail: [row('Gasto', value, date)] }); assert.ok(r.entries[0].issue); assert.throws(() => preview(r));
  }
});
test('Fórmulas sin resultado y errores de celdas no se convierten en cero', () => {
  const w = workbook(); w.Sheets['Registro semanal'].H5 = { t: 'n', f: 'SUM(A1:A2)' };
  let r = parse(w); assert.match(r.entries[1].issue, /fórmula|error de Excel/); assert.throws(() => preview(r));
  r = I.read(Buffer.from('PK'), 'personal.xlsx', { ...X, read: () => w }); assert.match(r.entries[1].issue, /fórmula/);
  w.Sheets['Registro semanal'].H5 = { t: 'e', v: 7 }; r = parse(w); assert.match(r.entries[1].issue, /error de Excel/);
});
test('Reimportar, renombrar, editar o eliminar registros importados no los duplica ni resucita', () => {
  const data = I.payload(report()), { store } = storeFixture(); store.importData(data);
  const first = store.load(), ids = first.movements.map(m => m.id); let r = store.importData(data);
  assert.equal(r.added, 0); assert.equal(r.duplicates, 3); assert.deepEqual(r.state.movements.map(m => m.id), ids);
  store.saveMovement({ ...first.movements[1], amount: 2000 }); store.removeMovement(first.movements[2].id);
  r = store.importData(data); assert.equal(r.added, 0); assert.equal(r.state.movements.length, 2); assert.equal(r.state.movements[1].amount, 2000);
});
test('Dos filas idénticas en el archivo se advierten y conservan con multiplicidad estable', () => {
  const r = report({ detail: [row('Ingreso', 100), row('Gasto', 10), row('Gasto', 10)] });
  assert.ok(r.warnings.some(w => w.includes('idénticas'))); const p = preview(r);
  assert.equal(p.totals.expense, 20); assert.equal(I.preview(r, p.state).added, 0);
});
test('Combinar reconoce coincidencias manuales, conserva IDs y no altera presupuestos históricos', () => {
  const data = I.payload(report()); let old = P.upsert(P.blank(), data.movements[0]);
  old = P.setBudget(old, '2026-08', { limit: 500, categories: [] }); const id = old.movements[0].id;
  const combined = P.prepareImport(old, data); assert.equal(combined.added, 2); assert.equal(combined.duplicates, 1); assert.equal(combined.state.movements[0].id, id);
  assert.deepEqual(combined.state.budgets, old.budgets);
});
test('Reemplazar solo los meses detectados es explícito, sin tocar meses anteriores o presupuestos', () => {
  const data = I.payload(report()); let old = P.upsert(P.blank(), { ...data.movements[0], date: '2026-07-01', amount: 55 });
  old = P.upsert(old, { ...data.movements[1], amount: 7 }); const id = old.movements[0].id;
  const r = P.prepareImport(old, data, { mode: 'replace' }); assert.equal(r.replaced, 1); assert.equal(r.added, 3); assert.equal(r.state.movements[0].id, id);
  assert.equal(P.overview(r.state, '2026-08').accumulated.available, 240);
});
test('Guardar es atómico, persiste IDs y categorías y solo escribe en la clave personal', () => {
  const { store, storage, data } = storeFixture(), payload = I.payload(report()); const r = store.importData(payload);
  assert.deepEqual(P.createStore(storage).load(), r.state); assert.equal(data.get('finora:casos:v1'), 'no cambiar');
  const previous = data.get(P.STORAGE_KEY); storage.setItem = () => { throw Error('quota'); };
  assert.throws(() => store.importData(payload, { mode: 'replace' }), /No se pudo guardar/); assert.equal(data.get(P.STORAGE_KEY), previous);
});
test('Estado histórico de Fase 1 se conserva; las lecturas no lo migran ni sobrescriben', () => {
  const old = P.upsert(P.blank(), I.payload(report()).movements[0]), raw = JSON.stringify(old), { store, data } = storeFixture(old);
  store.load(); assert.equal(data.get(P.STORAGE_KEY), raw); I.preview(report(), old); assert.equal(JSON.stringify(old), raw);
  assert.equal(old.importedRecords, undefined); assert.equal(old.goal, undefined);
});
test('Ahorro anterior se confirma como saldo inicial, sin ingreso ni descuento doble', () => {
  const r = report({ detail: [row('Ingreso', 1500), row('Gasto', 1315)], initial: [['Ahorro anterior:', 240], ['Disponible inicial:', 0], ['Costo de la meta:', 3500]] });
  assert.equal(r.openingReview, true); assert.throws(() => preview(r), /saldos iniciales/);
  r.openingReview = false; const p = preview(r); assert.equal(p.totals.saving, 0); assert.equal(p.totals.savingBalance, 240); assert.equal(p.totals.available, 185);
});
test('El historial completo reconstruye la continuación sin sumar otra vez los saldos', () => {
  const r = report({ detail: [row('Ingreso', 1500, '2026-07-27'), row('Gasto', 1260, '2026-08-28'), row('Ahorro', 240), row('Ingreso', 1500), row('Gasto', 1315, '2026-09-30')],
    initial: [['Inicio presupuesto:', '2026-08-29'], ['Saldo inicial del período:', 1500], ['Ahorro anterior:', 240]] });
  assert.equal(r.opening, null); assert.equal(r.openingReview, false); assert.equal(preview(r).totals.available, 185);
});
test('Saldos de continuación que no concilian necesitan confirmación, sin asumir cero', () => {
  const r = report({ detail: [row('Ingreso', 100, '2026-07-27'), row('Gasto', 10)], initial: [['Inicio presupuesto:', '2026-08-29'], ['Saldo inicial del período:', 1500], ['Ahorro anterior:', 240]] });
  assert.equal(r.openingReview, true); assert.throws(() => preview(r), /Confirma/);
});
test('Meta y saldos existentes solo se reemplazan con la opción explícita', () => {
  const data = I.payload(report()); let old = P.setOpening(P.blank(), { period: '2026-07', available: 20, saving: 100, reserve: 10 }); old.goal = { name: 'Anterior', amount: 1000 };
  const incoming = { ...data, opening: { period: '2026-08', available: 0, saving: 50, reserve: 0 } };
  let r = P.prepareImport(old, incoming); assert.equal(r.state.opening.saving, 100); assert.equal(r.state.goal.amount, 1000);
  r = P.prepareImport(old, incoming, { metadata: 'import' }); assert.equal(r.state.opening.saving, 50); assert.equal(r.state.goal.amount, 3500);
});
test('Semanas incorrectas en Excel se recalculan por fecha; los resúmenes discrepantes se advierten', () => {
  const r = report({ detail: [row('Ingreso', 100, '2026-12-31'), row('Gasto', 10, '2027-01-01')] }), p = preview(r);
  assert.ok(r.warnings.some(w => w.includes('semana escrita'))); assert.ok(p.warnings.some(w => w.includes('Diferencia')));
  const weeks = P.weekly(p.state, '2027-01'); assert.equal(weeks[0].from, '2027-01-01'); assert.equal(weeks[0].income, 0); assert.equal(weeks[0].available, 90);
});
test('Archivo incompatible, vacío, extensión errónea, corrupción, moneda y varias fuentes se rechazan', () => {
  assert.throws(() => I.read(Buffer.alloc(0), 'x.xlsx', X), /vacío/); assert.throws(() => I.read(Buffer.from('hola'), 'x.xlsx', X), /válido/);
  assert.throws(() => I.read(Buffer.from('hola'), 'x.csv', X), /xlsx/);
  let w = X.utils.book_new(); X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Hola']]), 'Hoja'); assert.throws(() => parse(w), /No se encontró/);
  w = workbook(); X.utils.book_append_sheet(w, w.Sheets['Registro semanal'], 'Movimientos'); assert.throws(() => parse(w), /varios/);
  w = workbook(); w.Sheets['Registro semanal'].A1.v = 'Registro en USD'; assert.throws(() => parse(w), /moneda/);
});
test('Excel de referencia real: 84 movimientos, cinco hojas, acumulados y archivo original intacto', { skip: !process.env.FINORA_PERSONAL_XLSX }, () => {
  const file = process.env.FINORA_PERSONAL_XLSX, bytes = fs.readFileSync(file), hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const r = I.read(bytes, 'referencia.xlsx', X), p = preview(r), view = P.overview(p.state, '2026-09');
  assert.equal(r.sheets.filter(s => s.role).length, 5); assert.equal(r.entries.length, 84); assert.equal(p.added, 84);
  assert.deepEqual(p.periods, ['2026-07', '2026-08', '2026-09']); assert.equal(p.totals.income, 3000); assert.equal(p.totals.expense, 2575);
  assert.equal(p.totals.savingBalance, 240); assert.equal(p.totals.reserveBalance, 0); assert.equal(p.totals.available, 185); assert.equal(view.goal.amount, 3500); assert.equal(view.goal.percent.toFixed(2), '6.86');
  assert.equal(r.openingReview, false); assert.equal(p.state.budgets, undefined); assert.equal(I.preview(r, p.state).added, 0);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
});
