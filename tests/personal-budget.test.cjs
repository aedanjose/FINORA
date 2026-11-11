'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), P = require('../assets/js/personal-budget.js');
const input = (type = 'expense', amount = 10, extra = {}) => ({ type, amount, date: '2026-06-15', category: 'Prueba',
  description: 'Movimiento de control', priority: 'need', paymentMethod: '', ...extra });
const academic = () => [input('income', 3000), input('expense', 2575), input('saving', 240)].reduce(P.upsert, P.blank());
function storageFixture() {
  const data = new Map([['finora:casos:v1', 'empresa intacta'], ['finora:global_currency', 'USD'], ['finora:presentation:v1', 'on']]);
  const written = [];
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { written.push(key); data.set(key, value); } };
  return { data, written, storage, store: P.createStore(storage) };
}
test('Escenario académico: C$3,000 − C$2,575 − C$240 = C$185 disponibles', () => {
  const r = P.summarize(academic(), '2026-06');
  assert.equal(r.income, 3000); assert.equal(r.expense, 2575); assert.equal(r.saving, 240); assert.equal(r.reserve, 0);
  assert.equal(r.openingAvailable, 0); assert.equal(r.available, 185); assert.equal(r.accumulatedSaving, 240);
  assert.equal(r.savingPercent, 8); assert.ok(Math.abs(r.expensePercent - 85.83333333333333) < 1e-10);
  assert.equal(P.money(r.available), 'C$ 185.00');
});
test('Registro, edición y eliminación conservan identificadores y recalculan sin mutar el original', () => {
  const original = academic(), before = JSON.stringify(original), expense = original.movements.find(row => row.type === 'expense');
  let edited = P.upsert(original, { ...expense, amount: '2500.00', description: 'Actualizado', priority: 'want', paymentMethod: 'Efectivo' });
  assert.equal(edited.movements.length, 3); assert.equal(edited.movements.find(row => row.id === expense.id).description, 'Actualizado');
  assert.equal(P.summarize(edited, '2026-06').available, 260); assert.equal(JSON.stringify(original), before);
  const saving = edited.movements.find(row => row.type === 'saving'); edited = P.remove(edited, saving.id);
  assert.equal(P.summarize(edited, '2026-06').available, 500); assert.equal(P.summarize(edited, '2026-06').accumulatedSaving, 0);
  assert.throws(() => P.upsert(edited, { ...expense, id: 'inexistente' }), /ya no existe/);
  assert.throws(() => P.remove(edited, 'inexistente'), /ya no existe/);
});
test('Ahorro anterior y reservas son fondos separados, nunca ingresos ni doble descuento', () => {
  let s = P.setOpening(P.blank(), { period: '2026-06', available: 100, saving: 1000, reserve: 500 });
  for (const record of [input('income', 3000), input('expense', 2575), input('saving', 240), input('reserve', 50)]) s = P.upsert(s, record);
  const june = P.summarize(s, '2026-06'), july = P.summarize(s, '2026-07');
  assert.equal(june.income, 3000); assert.equal(june.available, 235); assert.equal(june.accumulatedSaving, 1240); assert.equal(june.accumulatedReserve, 550);
  assert.equal(july.income, 0); assert.equal(july.saving, 0); assert.equal(july.reserve, 0);
  assert.equal(july.openingAvailable, 235); assert.equal(july.available, 235); assert.equal(july.accumulatedSaving, 1240); assert.equal(july.accumulatedReserve, 550);
});
test('Períodos, meses sin movimientos, cambio de fecha y revisión retroactiva', () => {
  let s = academic(); s = P.upsert(s, input('income', 100, { date: '2026-07-01' }));
  assert.equal(P.summarize(s, '2026-06').count, 3); assert.equal(P.summarize(s, '2026-07').count, 1);
  assert.equal(P.summarize(s, '2026-07').available, 285); assert.equal(P.summarize(s, '2026-09').available, 285);
  const expense = s.movements.find(row => row.type === 'expense'); s = P.upsert(s, { ...expense, date: '2026-07-15' });
  assert.equal(P.summarize(s, '2026-06').available, 2760); assert.equal(P.summarize(s, '2026-07').expense, 2575);
  assert.equal(P.summarize(s, '2026-07').available, 285);
  s = P.remove(s, expense.id); assert.equal(P.summarize(s, '2026-09').available, 2860);
});
test('Saldos iniciales se aplican una vez desde su mes, y no después de movimientos anteriores', () => {
  const s = P.setOpening(academic(), { period: '2026-06', available: 50, saving: 200, reserve: 100 });
  assert.equal(P.summarize(s, '2026-05').available, 0); assert.equal(P.summarize(s, '2026-05').beforeOpening, true);
  assert.equal(P.summarize(s, '2026-07').available, 235); assert.equal(P.summarize(s, '2027-06').accumulatedSaving, 440);
  assert.throws(() => P.setOpening(s, { period: '2026-07', available: 50, saving: 200, reserve: 100 }), /anteriores/);
  assert.throws(() => P.upsert(s, input('income', 25, { date: '2026-05-31' })), /anterior/);
  assert.throws(() => P.setOpening(s, { period: null, available: 50, saving: 0, reserve: 0 }), /mes de inicio/);
});
test('Cero ingresos, déficits y base disponible negativa conservan signos', () => {
  let s = P.upsert(P.blank(), input('expense', 50));
  let r = P.summarize(s, '2026-06'); assert.equal(r.available, -50); assert.equal(r.expensePercent, null); assert.equal(r.savingPercent, null);
  assert.equal(P.money(r.available), '−C$ 50.00');
  s = P.setOpening(s, { period: '2026-06', available: -20, saving: 0, reserve: 0 });
  r = P.summarize(s, '2026-07'); assert.equal(r.available, -70); assert.equal(r.income, 0);
});
test('Centavos exactos sin residuos binarios ni redondeo arbitrario', () => {
  let s = P.upsert(P.blank(), input('income', '0.30')); s = P.upsert(s, input('expense', '0.10')); s = P.upsert(s, input('saving', '0.20'));
  assert.equal(P.summarize(s, '2026-06').available, 0);
  s = P.upsert(s, input('income', '1.01')); assert.equal(P.summarize(s, '2026-06').available, 1.01);
  assert.throws(() => P.upsert(s, input('expense', '1.005')), /decimales/);
});
test('Importes inválidos, infinitos, vacíos, negativos y campos obligatorios se rechazan', () => {
  for (const amount of [null, undefined, '', ' ', 0, -1, NaN, Infinity, true, 'abc', '1e3', '1,000', '0.001', 1e13]) {
    assert.throws(() => P.upsert(P.blank(), input('income', 10, { amount })), undefined, String(amount));
  }
  for (const field of ['date', 'category', 'description', 'priority']) assert.throws(() => P.upsert(P.blank(), input('expense', 20, { [field]: ' ' })), undefined, field);
  assert.throws(() => P.upsert(P.blank(), input('__proto__', 20)), /tipo/);
  assert.throws(() => P.upsert(P.blank(), input('expense', 20, { description: 'a'.repeat(121) })), /Descripción/);
  assert.throws(() => P.upsert(P.blank(), input('expense', 20, { category: 'a'.repeat(61) })), /Categoría/);
  assert.throws(() => P.upsert(P.blank(), input('expense', 20, { paymentMethod: 'a'.repeat(61) })), /Medio de pago/);
});
test('Fechas reales, año bisiesto, cambio de año y períodos inválidos', () => {
  assert.equal(P.validDate('2024-02-29'), true);
  for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '0000-01-01', '2026-01-01T12:00:00Z']) assert.throws(() => P.upsert(P.blank(), input('income', 1, { date })), /fecha/);
  const s = P.upsert(P.blank(), input('income', 12, { date: '2025-12-31' }));
  assert.equal(P.summarize(s, '2026-01').openingAvailable, 12);
  for (const period of ['', '2026', '2026-13', '2026-1', '0000-01', null]) assert.throws(() => P.summarize(s, period), /período/);
});
test('Prioridad corresponde al gasto y medio de pago es opcional', () => {
  for (const type of ['income', 'saving', 'reserve']) {
    const s = P.upsert(P.blank(), input(type, 10, { priority: '', paymentMethod: undefined }));
    assert.equal(s.movements[0].priority, null); assert.equal(s.movements[0].paymentMethod, '');
  }
  const s = P.upsert(P.blank(), input('expense', 10, { priority: 'want', paymentMethod: ' Tarjeta ' }));
  assert.equal(s.movements[0].priority, 'want'); assert.equal(s.movements[0].paymentMethod, 'Tarjeta');
});
test('Cambiar tipo recalcula la clasificación; ahorro y reserva no cuentan como gastos', () => {
  let s = P.upsert(P.blank(), input('expense', 100)), row = s.movements[0];
  s = P.upsert(s, { ...row, type: 'saving' }); let r = P.summarize(s, '2026-06');
  assert.equal(r.expense, 0); assert.equal(r.saving, 100); assert.equal(r.available, -100); assert.equal(s.movements[0].id, row.id);
  s = P.upsert(s, { ...s.movements[0], type: 'reserve' }); r = P.summarize(s, '2026-06');
  assert.equal(r.saving, 0); assert.equal(r.reserve, 100); assert.equal(r.available, -100);
});
test('Filtros solo afectan filas, no totales ni registros almacenados', () => {
  const s = academic(), before = JSON.stringify(s), all = P.summarize(s, '2026-06');
  for (const filter of ['income', 'expense', 'saving']) {
    const r = P.summarize(s, '2026-06', filter); assert.equal(r.movements.length, 1); assert.equal(r.count, 3); assert.equal(r.available, all.available);
    assert.equal(r.movements[0].type, filter);
  }
  assert.equal(P.summarize(s, '2026-06', 'reserve').movements.length, 0); assert.equal(JSON.stringify(s), before);
});
test('Persistencia, identificadores, categorías adicionales y aislamiento de otras claves', () => {
  const { store, storage, data, written } = storageFixture();
  assert.equal(data.has(P.STORAGE_KEY), false); assert.deepEqual(store.load(), P.blank());
  const saved = store.saveMovement(input('expense', 50, { category: 'Mascotas', description: 'Veterinario' })), id = saved.movements[0].id;
  const reloaded = P.createStore(storage); assert.equal(reloaded.load().movements[0].id, id); assert.ok(P.categoriesFor(reloaded.load(), 'expense').includes('Mascotas'));
  reloaded.saveMovement({ ...saved.movements[0], amount: 75 }); assert.equal(reloaded.load().movements[0].id, id);
  reloaded.selectPeriod('2026-07'); assert.equal(P.createStore(storage).load().selectedPeriod, '2026-07');
  assert.equal(reloaded.load().movements.length, 1); assert.equal(P.summarize(reloaded.load(), '2026-06').expense, 75);
  assert.ok(written.every(key => key === P.STORAGE_KEY)); assert.equal(data.get('finora:casos:v1'), 'empresa intacta'); assert.equal(data.get('finora:global_currency'), 'USD');
  reloaded.removeMovement(id); assert.equal(reloaded.load().movements.length, 0); assert.ok(P.categoriesFor(reloaded.load(), 'expense').includes('Mascotas'));
});
test('Las categorías se reutilizan por tipo sin duplicar diferencias de mayúsculas', () => {
  let s = P.upsert(P.blank(), input('income', 1, { category: ' salario ' }));
  assert.equal(s.movements[0].category, 'Salario'); assert.equal(s.categories.income.length, 0);
  s = P.upsert(s, input('expense', 1, { category: 'Mascotas' })); s = P.upsert(s, input('expense', 1, { category: 'mascotas' }));
  assert.deepEqual(s.categories.expense, ['Mascotas']); assert.ok(!P.categoriesFor(s, 'income').includes('Mascotas'));
});
test('Dos instancias leen datos frescos antes de escribir sin perder registros existentes', () => {
  const { store, storage } = storageFixture(), other = P.createStore(storage);
  store.saveMovement(input('income', 200)); other.saveMovement(input('expense', 20));
  assert.equal(store.load().movements.length, 2); assert.equal(P.summarize(other.load(), '2026-06').available, 180);
});
test('Error de almacenamiento no simula guardado ni pierde la versión anterior', () => {
  const { store, storage, data } = storageFixture(); store.saveMovement(input('income', 100)); const raw = data.get(P.STORAGE_KEY);
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  assert.throws(() => store.saveMovement(input('expense', 10)), /No se pudo guardar/);
  assert.equal(data.get(P.STORAGE_KEY), raw); assert.equal(store.load().movements.length, 1);
  assert.throws(() => P.createStore(() => { throw Error('SecurityError'); }).load(), /No se puede leer/);
});
test('Datos corruptos, versión desconocida e IDs duplicados no se sobrescriben', () => {
  const { data, store } = storageFixture(), bad = academic(); bad.movements[1].id = bad.movements[0].id;
  for (const raw of ['{invalido', JSON.stringify({ ...P.blank(), version: 2 }), JSON.stringify(bad)]) {
    data.set(P.STORAGE_KEY, raw); assert.throws(() => store.load(), /No se sobrescribieron/);
    assert.throws(() => store.saveMovement(input('income', 100)), /No se sobrescribieron/); assert.equal(data.get(P.STORAGE_KEY), raw);
  }
});
test('Límites extremos se validan antes del guardado y el estado vacío es cero real', () => {
  const { store } = storageFixture(); const empty = P.summarize(store.load(), '2026-06');
  assert.equal(empty.available, 0); assert.equal(empty.count, 0); assert.equal(empty.expensePercent, null);
  store.saveMovement(input('income', P.MAX_AMOUNT)); assert.equal(P.summarize(store.load(), '2026-06').available, P.MAX_AMOUNT);
  assert.throws(() => store.saveMovement(input('income', .01)), /límite/); assert.equal(store.load().movements.length, 1);
});
test('Motor del navegador funciona sin módulos empresariales ni dependencias', () => {
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(require.resolve('../assets/js/personal-budget.js'), 'utf8'), context);
  assert.equal(vm.runInContext('FinoraPersonal.summarize(FinoraPersonal.blank(), "2026-06").available', context), 0);
  assert.equal(vm.runInContext('typeof FinoraCasos', context), 'undefined');
  const html = fs.readFileSync(require.resolve('../modulos/presupuesto-personal/index.html'), 'utf8');
  assert.doesNotMatch(html, /src="[^"]*\/(?:budget|casos|finance|proforma|leverage)\.js"/);
});

test('Comparación de límites: 70%, 120%, cero y gastos sin asignar, sin incluir fondos separados', () => {
  let state = P.setBudget(P.blank(), '2026-06', { limit: 800, categories: [{ name: 'Alimentación', limit: 500 }, { name: 'Salud', limit: 0 }] });
  state = P.upsert(state, input('expense', 350, { category: 'Alimentación' }));
  state = P.upsert(state, input('saving', 200, { category: 'Alimentación' }));
  state = P.upsert(state, input('reserve', 20, { category: 'Alimentación' }));
  let r = P.compareBudget(state, '2026-06');
  assert.equal(r.categories[0].percent, 70); assert.equal(r.categories[0].available, 150); assert.equal(r.categories[0].status, 'within'); assert.equal(r.unallocated, 300);
  const id = state.movements[0].id; state = P.upsert(state, input('expense', 600, { category: 'Alimentación', id }));
  r = P.compareBudget(state, '2026-06'); assert.equal(r.categories[0].percent, 120); assert.equal(r.categories[0].excess, 100); assert.equal(r.categories[0].status, 'exceeded');
  state = P.upsert(state, input('expense', 5, { category: 'Salud' })); state = P.upsert(state, input('expense', 10, { category: 'Mascotas' }));
  r = P.compareBudget(state, '2026-06'); assert.equal(r.categories[1].percent, null); assert.equal(r.categories[1].excess, 5); assert.equal(r.unbudgetedExpense, 10);
  state = P.remove(state, id); assert.equal(P.compareBudget(state, '2026-06').categories[0].actual, 0);
});

test('Alertas al 80% y 100%; presupuestos por mes preservan datos anteriores', () => {
  const before = academic(), raw = JSON.stringify(before);
  let state = P.setBudget(before, '2026-06', { limit: 3000, categories: [{ name: 'Prueba', limit: 3000 }] });
  assert.equal(JSON.stringify(before), raw); assert.deepEqual(state.movements, before.movements); assert.equal(P.summarize(state, '2026-06').available, 185);
  assert.equal(P.compareBudget(state, '2026-06').categories[0].status, 'warning');
  state = P.setBudget(state, '2026-06', { limit: 2575, categories: [{ name: 'Prueba', limit: 2575 }] });
  assert.equal(P.compareBudget(state, '2026-06').total.status, 'reached'); assert.equal(P.compareBudget(state, '2026-07').planned, false);
  state = P.setBudget(state, '2026-07', { limit: 0, categories: [] }); assert.equal(P.compareBudget(state, '2026-07').total.status, 'within');
  assert.equal(state.budgets['2026-06'].limit, 2575);
  assert.throws(() => P.setBudget(state, '2026-06', { limit: 1, categories: [{ name: 'A', limit: 2 }] }), /supera/);
  assert.throws(() => P.setBudget(state, '2026-06', { limit: 1, categories: [{ name: 'A', limit: 0 }, { name: 'a', limit: 0 }] }), /repetida/);
});

test('Semanas lunes-domingo recortadas al mes y al año, con continuidad y centavos', () => {
  let state = P.setOpening(P.blank(), { period: '2026-12', available: 100, saving: 240, reserve: 10 });
  for (const item of [input('income', 200, { date: '2026-12-31' }), input('expense', 5, { date: '2027-01-01' }), input('saving', 10.01, { date: '2027-01-03' }), input('reserve', 20.02, { date: '2027-01-04' })]) state = P.upsert(state, item);
  const weeks = P.weekly(state, '2027-01');
  assert.equal(weeks[0].from, '2027-01-01'); assert.equal(weeks[0].to, '2027-01-03'); assert.equal(weeks[0].income, 0);
  assert.equal(weeks[0].available, 284.99); assert.equal(weeks[1].from, '2027-01-04'); assert.equal(weeks[1].available, 264.97);
  assert.equal(weeks.at(-1).to, '2027-01-31'); assert.equal(weeks.at(-1).available, P.summarize(state, '2027-01').available);
  assert.equal(weeks.flatMap(w => w.movements).length, 3); assert.equal(P.weekly(state, '2028-02').at(-1).to, '2028-02-29');
});

test('Vista acumulada, porcentajes por categoría y gráficos usan los movimientos actuales', () => {
  let state = academic(); state = P.prepareImport(state, { movements: [input('income', 100, { date: '2026-07-01' })], goal: { name: 'Meta', amount: 3500 } }).state;
  let view = P.overview(state, '2026-07'); assert.equal(view.accumulated.income, 3100); assert.equal(view.accumulated.available, 285);
  assert.equal(view.goal.saved, 240); assert.equal(view.goal.percent.toFixed(2), '6.86'); assert.equal(view.categories.length, 0);
  view = P.overview(state, '2026-06'); assert.equal(view.categories[0].expensePercent, 100); assert.equal(view.categories[0].incomePercent.toFixed(2), '85.83');
  const expense = state.movements.find(row => row.type === 'expense'); state = P.remove(state, expense.id);
  assert.equal(P.overview(state, '2026-07').accumulated.expense, 0); assert.equal(P.overview(state, '2026-06').categories.length, 0);
});
