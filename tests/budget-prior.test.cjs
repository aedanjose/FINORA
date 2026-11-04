'use strict';
// Fase 1B: ventas y compras de los dos períodos anteriores al presupuesto, con las políticas de la Fase 1A.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js'), B = require('../assets/js/budget.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const arr = (r, key) => r.rows.map(x => x[key]);
const nearAll = (got, want) => { assert.equal(got.length, want.length); got.forEach((v, i) => near(v, want[i])); };

// Caso obligatorio (miles): ventas oct–dic 400/300/200 y compras 280/210/140; anteriores: ventas ago 100, sep 200; compras ago 70, sep 140.
function fixture({ prior = { sales: { before2: 100, before1: 200 }, purchases: { before2: 70, before1: 140 } }, receivables = 190, payables = 140 } = {}) {
  const c = C.blankCase('Fase 1B'), s = B.newProjection(c);
  s.config = { frequency: 'monthly', start: '2026-10-01', count: 3 };
  const periods = B.periodList(s.config), product = s.products[0];
  Object.assign(product, { initialUnits: 0, initialValue: 0, inventoryMode: 'manual' });
  s.expenses = [{ id: 'opex', label: 'Administración', category: 'administration', mode: 'manual', values: {} }];
  Object.assign(s.result, { interestMode: 'none', taxMode: 'manual', otherEnabled: false });
  const equity = 200 + receivables + 100 - payables - 200;
  Object.assign(s.advanced, { enabled: true, openingSource: 'manual', confirmed: true, baseSignature: B.signature(c),
    opening: { ...Object.fromEntries(Object.keys(B.openingFields).map(k => [k, 0])), cash: 200, receivables, payables, fixed: 100, longDebt: 200, equity },
    collectionPolicy: { current: 20, next: 50, after: 30 }, paymentPolicy: { current: 10, next: 70, after: 20 }, ...(prior ? { prior } : {}) });
  periods.forEach((p, i) => {
    product.values[p.key] = { units: [4, 3, 2][i], price: 100, unitCost: 70, targetUnits: 0 };
    s.expenses[0].values[p.key] = 0; s.result.taxes[p.key] = 0;
    s.advanced.values[p.key] = { capex: 0, dividends: 0, financing: 0, minimumCash: 0 };
  });
  c.params.budget = s; return { c, s, periods };
}

test('Caso obligatorio: cobros 210/320/310, pagos 140/245/217, CxC 250 y CxP 168', () => {
  const r = B.analyze(fixture().c);
  nearAll(arr(r, 'sales'), [400, 300, 200]); nearAll(arr(r, 'purchases'), [280, 210, 140]);
  nearAll(arr(r, 'collections'), [210, 320, 310]);
  nearAll(arr(r, 'payments'), [140, 245, 217]);
  near(r.rows.at(-1).receivables, 250); near(r.rows.at(-1).payables, 168);
  assert.deepEqual(r.warnings.filter(w => /iniciales del balance/.test(w)), []);
  near(r.priorCheck.receivables.expected, 190); near(r.priorCheck.receivables.difference, 0);
  near(r.priorCheck.payables.expected, 140); near(r.priorCheck.payables.difference, 0);
});

test('Origen de cada cobro y pago, sin duplicar las cuentas iniciales', () => {
  const r = B.analyze(fixture().c);
  nearAll(arr(r, 'currentCollections'), [80, 60, 40]);
  nearAll(arr(r, 'creditCollectionsPrevious'), [0, 200, 150]);
  nearAll(arr(r, 'creditCollectionsEarlier'), [0, 0, 120]);
  nearAll(arr(r, 'priorCollections'), [130, 60, 0]);            // sep 50 % + ago 30 %; luego sep 30 %
  nearAll(arr(r, 'initialReceivablesCollected'), [0, 0, 0]);    // las CxC iniciales ya son esas ventas anteriores
  nearAll(arr(r, 'priorPayments'), [112, 28, 0]);               // sep 70 % + ago 20 %; luego sep 20 %
  nearAll(arr(r, 'initialPayablesPaid'), [0, 0, 0]);
  near(r.totals.priorCollections, 190); near(r.totals.priorPayments, 140);
});

test('Continuidad de saldos: cada período parte del anterior y lo pendiente es lo de la política', () => {
  const r = B.analyze(fixture().c);
  let receivables = 190, payables = 140;
  r.rows.forEach(row => {
    receivables += row.sales - row.collections; payables += row.purchases - row.payments;
    near(row.receivables, receivables); near(row.payables, payables);
  });
  near(r.rows.at(-1).receivables, 200 * .8 + 300 * .3);          // dic 80 % + nov 30 %
  near(r.rows.at(-1).payables, 140 * .9 + 210 * .2);              // dic 90 % + nov 20 %
  near(r.totals.collections + r.rows.at(-1).receivables, 190 + r.totals.sales);
});

test('Diferencia con el balance: se muestra y no se ajusta nada', () => {
  const r = B.analyze(fixture({ receivables: 200 }).c);
  near(r.priorCheck.receivables.difference, 10);
  assert.ok(r.warnings.some(w => /cuentas por cobrar iniciales del balance .* difieren .* diferencia .*no se ajusta automáticamente/i.test(w)), r.warnings.join(' | '));
  near(r.opening.receivables, 200);                               // el balance queda como está
  nearAll(arr(r, 'collections'), [210, 320, 310]);                // los cobros siguen las operaciones informadas
  near(r.rows.at(-1).receivables, 260);
});

test('Compatibilidad: sin operaciones anteriores se conserva el criterio anterior', () => {
  const r = B.analyze(fixture({ prior: null }).c);
  nearAll(arr(r, 'priorCollections'), [0, 0, 0]);
  nearAll(arr(r, 'initialReceivablesCollected'), [190, 0, 0]);
  nearAll(arr(r, 'initialPayablesPaid'), [140, 0, 0]);
  nearAll(arr(r, 'collections'), [270, 260, 310]);
  assert.equal(r.priorCheck.receivables, null);
});

test('Datos parciales: un período vacío queda pendiente; cada estado es independiente', () => {
  let r = B.analyze(fixture({ prior: { sales: { before2: '', before1: 200 } } }).c);
  assert.ok(r.issues.some(t => /Ventas de dos períodos antes del inicio: falta un número válido/.test(t)), r.issues.join(' | '));
  assert.equal(r.rows[0].collections, null);
  nearAll(arr(r, 'initialPayablesPaid'), [140, 0, 0]);           // sin compras anteriores: criterio anterior
  r = B.analyze(fixture({ prior: { sales: { before2: 0, before1: 0 } } }).c);
  near(r.priorCheck.receivables.difference, 190);                 // cero informado es un dato, no un vacío
});

test('Cambiar la política recalcula los cobros anteriores y la conciliación', () => {
  const { c, s } = fixture();
  s.advanced.collectionPolicy = { current: 100, next: 0, after: 0 };
  const r = B.analyze(c);
  nearAll(arr(r, 'priorCollections'), [0, 0, 0]);
  near(r.priorCheck.receivables.expected, 0); near(r.priorCheck.receivables.difference, 190);
});
