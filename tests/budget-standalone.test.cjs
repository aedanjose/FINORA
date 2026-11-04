'use strict';
// Fase 1C: presupuesto de caja independiente (sin Balance General proforma) y su conexión con el modo integrado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js'), B = require('../assets/js/budget.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const arr = (r, key) => r.rows.map(x => x[key]);
const nearAll = (got, want) => { assert.equal(got.length, want.length); got.forEach((v, i) => near(v, want[i])); };
const byPeriod = (periods, values) => Object.fromEntries(periods.map((p, i) => [p.key, values[i]]));

// Caso Halley (miles). Desglose supuesto de los desembolsos 213/418/305: proveedores + gastos 60 + impuestos 0/0/20
// + intereses 3 + otros 10/10/5 + principal 0/100/0.
function halley({ frequency = 'monthly', start = '2026-10-01', count = 3 } = {}) {
  const c = C.blankCase('Halley'), s = B.newProjection(c);
  s.mode = 'cash'; s.config = { frequency, start, count };
  const periods = B.periodList(s.config), v = values => byPeriod(periods, values);
  Object.assign(s.advanced, { collectionPolicy: { current: 20, next: 50, after: 30 }, paymentPolicy: { current: 10, next: 70, after: 20 },
    prior: { sales: { before2: 100, before1: 200 }, purchases: { before2: 70, before1: 140 } } });
  s.cash = { openingCash: 50, sales: v([400, 300, 200]), purchases: v([280, 210, 140]), opex: v([60, 60, 60]), taxes: v([0, 0, 20]),
    interest: v([3, 3, 3]), otherIncome: v([0, 0, 30]), otherDisbursements: v([10, 10, 5]), principal: v([0, 100, 0]) };
  periods.forEach(p => { s.advanced.values[p.key] = { minimumCash: 25 }; });
  c.params.budget = s; return { c, s, periods };
}

test('Caso Halley sin Balance General: efectivo final 47/−51/−16, excedente 22, faltantes 76 y 41', () => {
  const r = B.analyze(halley().c);
  assert.equal(r.mode, 'cash'); assert.equal(r.cashSource, 'manual');
  nearAll(arr(r, 'collections'), [210, 320, 310]);
  nearAll(arr(r, 'otherIncome'), [0, 0, 30]);
  nearAll(arr(r, 'payments'), [140, 245, 217]);
  nearAll(arr(r, 'cashOutflows'), [213, 418, 305]);
  nearAll(arr(r, 'openingCash'), [50, 47, -51]);
  nearAll(arr(r, 'cashBeforeFinancing'), [47, -51, -16]);
  nearAll(arr(r, 'cash'), [47, -51, -16]);
  nearAll(arr(r, 'cashSurplus'), [22, 0, 0]);
  nearAll(arr(r, 'cashShortfall'), [0, 76, 41]);
  assert.equal(r.ready, true, r.issues.join(' | '));
  assert.equal(r.stages.cash.ready, true); assert.equal(r.stages.balance.ready, false);
  assert.equal(r.cashMinimum.ready, true);
});

test('El principal sale una sola vez, dentro de los desembolsos; sin préstamos automáticos', () => {
  const r = B.analyze(halley().c);
  nearAll(arr(r, 'principalPaid'), [0, 100, 0]); near(r.totals.principalPaid, 100);
  nearAll(arr(r, 'financing'), [0, 0, 0]);
  r.rows.forEach(row => near(row.cashOutflows, row.payments + row.opex + row.taxesAndInterest + row.otherDisbursements + row.principalPaid));
  near(r.rows[1].cashMovement, r.rows[1].cash - r.rows[1].openingCash);
  assert.ok(r.warnings.some(w => /déficit de caja.*No se agrega financiamiento automático/.test(w)));
});

test('No exige balance, productos, inventarios, costo de ventas ni utilidad', () => {
  const r = B.analyze(halley().c);
  assert.deepEqual(r.issues, []);
  assert.equal(r.stages.income.ready, false);                       // la etapa de resultados no se completó y no bloquea
  assert.equal(r.priorCheck, null);
  near(r.opening.receivables, 190); near(r.opening.payables, 140);  // pendiente de las operaciones anteriores
  near(r.rows.at(-1).receivables, 250); near(r.rows.at(-1).payables, 168);
  assert.equal(r.closing.assets, null);                             // no se arma balance proforma
});

test('Datos vacíos y ceros: un vacío obligatorio queda pendiente; los extraordinarios vacíos valen 0', () => {
  let { c, s, periods } = halley();
  s.cash.opex[periods[1].key] = '';
  let r = B.analyze(c);
  assert.ok(r.issues.some(t => /Gastos operativos pagados · .*falta un número válido/.test(t)), r.issues.join(' | '));
  assert.equal(r.rows[1].cash, null); assert.equal(r.rows[2].openingCash, null); assert.equal(r.ready, false);
  ({ c, s, periods } = halley());
  s.cash.otherIncome = {}; s.cash.otherDisbursements = {}; s.cash.principal = {};
  r = B.analyze(c); assert.equal(r.ready, true); nearAll(arr(r, 'cashOutflows'), [203, 308, 300]);
  ({ c, s } = halley()); s.cash.openingCash = null;
  r = B.analyze(c); assert.ok(r.issues.some(t => /Saldo inicial de efectivo/.test(t))); assert.equal(r.rows[0].cash, null);
  ({ c, s, periods } = halley()); s.cash.openingCash = 0; s.advanced.values[periods[0].key].minimumCash = 0;
  r = B.analyze(c); near(r.rows[0].cash, -3); near(r.rows[0].cashShortfall, 3);
  ({ c, s, periods } = halley()); delete s.advanced.values[periods[2].key].minimumCash;
  r = B.analyze(c); assert.equal(r.cashMinimum.ready, false); near(r.rows[2].cash, -16); assert.equal(r.rows[2].cashShortfall, null);
});

test('Saldos negativos: efectivo inicial negativo y préstamo registrado manualmente', () => {
  const { c, s, periods } = halley();
  s.cash.openingCash = -20;
  let r = B.analyze(c); nearAll(arr(r, 'cash'), [-23, -121, -86]); nearAll(arr(r, 'cashShortfall'), [48, 146, 111]);
  s.advanced.values[periods[1].key].financing = 150;
  r = B.analyze(c); nearAll(arr(r, 'cashBeforeFinancing'), [-23, -121, 64]); nearAll(arr(r, 'cash'), [-23, 29, 64]);
  near(r.rows[1].financingRequired, 146); near(r.totals.principalPaid, 100);
});

test('Cambiar porcentajes recalcula cobros y caja; una política que no suma 100 % bloquea', () => {
  const { c, s } = halley();
  s.advanced.collectionPolicy = { current: 100, next: 0, after: 0 };
  let r = B.analyze(c); nearAll(arr(r, 'collections'), [400, 300, 200]); near(r.opening.receivables, 0); near(r.rows[0].cash, 237);
  s.advanced.collectionPolicy = { current: 50, next: 50, after: 10 };
  r = B.analyze(c); assert.ok(r.issues.some(t => /política de cobros debe sumar 100 %/.test(t))); assert.equal(r.rows[0].cash, null);
});

test('Períodos: horizonte más corto y periodicidad anual', () => {
  let { c } = halley({ count: 2 });
  let r = B.analyze(c); nearAll(arr(r, 'cash'), [47, -51]);
  ({ c } = halley({ frequency: 'annual', start: '2026-01-01' }));
  r = B.analyze(c); assert.deepEqual(r.periods.map(p => p.key), ['2026', '2027', '2028']); nearAll(arr(r, 'cash'), [47, -51, -16]);
});

test('Persistencia: guardar y recuperar conserva la modalidad, las entradas y los resultados', () => {
  const { c, s } = halley(), before = B.analyze(c);
  const saved = JSON.parse(JSON.stringify(B.saveProjection(c, s)));
  assert.equal(saved.params.budget.mode, 'cash'); assert.deepEqual(saved.params.budget.cash, s.cash);
  const upgraded = B.upgrade(saved, saved.params.budget); assert.equal(upgraded.mode, 'cash'); assert.deepEqual(upgraded.cash, s.cash);
  assert.deepEqual(B.analyze(saved).rows.map(x => x.cash), before.rows.map(x => x.cash));
});

// Conexión: proyección integrada completa (Fase 1B) con las mismas políticas y operaciones anteriores.
function integrated() {
  const c = C.blankCase('Integrado'), s = B.newProjection(c);
  s.config = { frequency: 'monthly', start: '2026-10-01', count: 3 };
  const periods = B.periodList(s.config), product = s.products[0];
  Object.assign(product, { initialUnits: 0, initialValue: 0, inventoryMode: 'manual' });
  s.expenses = [{ id: 'opex', label: 'Administración', category: 'administration', mode: 'manual', values: {} }, { id: 'dep', label: 'Depreciación', category: 'depreciation', mode: 'manual', values: {} }];
  Object.assign(s.result, { interestMode: 'none', taxMode: 'manual', otherEnabled: false });
  Object.assign(s.advanced, { enabled: true, openingSource: 'manual', confirmed: true, baseSignature: B.signature(c),
    opening: { ...Object.fromEntries(Object.keys(B.openingFields).map(k => [k, 0])), cash: 50, receivables: 190, payables: 140, fixed: 100, longDebt: 200, equity: 0 },
    collectionPolicy: { current: 20, next: 50, after: 30 }, paymentPolicy: { current: 10, next: 70, after: 20 },
    prior: { sales: { before2: 100, before1: 200 }, purchases: { before2: 70, before1: 140 } } });
  periods.forEach((p, i) => {
    product.values[p.key] = { units: [4, 3, 2][i], price: 100, unitCost: 70, targetUnits: 0 };
    s.expenses[0].values[p.key] = 60; s.expenses[1].values[p.key] = 15; s.result.taxes[p.key] = 0;
    s.advanced.values[p.key] = { capex: 0, dividends: 0, financing: 0, minimumCash: 25 };
  });
  c.params.budget = s; return { c, s, periods };
}

test('Conexión: la caja independiente reutiliza el presupuesto de ventas y compras sin sobrescribirlo', () => {
  const { c, s, periods } = integrated(), base = B.analyze(c);
  s.mode = 'cash';
  s.cash = { openingCash: 50, sales: byPeriod(periods, [999, 999, 999]), purchases: {}, opex: byPeriod(periods, [60, 60, 60]),
    taxes: byPeriod(periods, [0, 0, 0]), interest: byPeriod(periods, [0, 0, 0]) };
  const r = B.analyze(c);
  assert.equal(r.cashSource, 'budget'); assert.equal(r.ready, true, r.issues.join(' | '));
  nearAll(arr(r, 'sales'), [400, 300, 200]);                        // los importes manuales no reemplazan al presupuesto
  nearAll(arr(r, 'collections'), arr(base, 'collections')); nearAll(arr(r, 'payments'), arr(base, 'payments'));
  nearAll(arr(r, 'cash'), arr(base, 'cash'));                       // la depreciación no es desembolso en ningún modo
  assert.equal(s.cash.sales[periods[0].key], 999);
  assert.equal(r.stages.balance.ready, false);
});

test('Conexión: el modo integrado y los datos anteriores no cambian por tener entradas de caja independiente', () => {
  const { c, s } = integrated(), base = B.analyze(c);
  assert.equal(base.mode, 'integrated'); assert.equal(base.cashSource, null); assert.equal(base.ready, true, base.issues.join(' | '));
  near(base.closing.difference, 0);
  delete s.mode; delete s.cash;                                     // proyección guardada antes de la Fase 1C
  const legacy = B.analyze(c);
  assert.deepEqual(legacy.rows, base.rows); assert.deepEqual(legacy.closing, base.closing);
  Object.assign(s, { mode: 'integrated', cash: halley().s.cash });
  assert.deepEqual(B.analyze(c).rows, base.rows);
});
