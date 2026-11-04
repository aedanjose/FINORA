'use strict';
// Políticas de cobros y pagos en tres períodos (actual, siguiente, dos después).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js'), B = require('../assets/js/budget.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

// Ventas 1,000 / 2,000 / 1,500 y compras 400 / 800 / 600; cuentas iniciales por cobrar 100 y por pagar 50.
function fixture(policies = { collectionPolicy: { current: 20, next: 50, after: 30 }, paymentPolicy: { current: 10, next: 70, after: 20 } }) {
  const c = C.blankCase('Políticas'), s = B.newProjection(c);
  s.config = { frequency: 'monthly', start: '2026-01-01', count: 3 };
  const periods = B.periodList(s.config), product = s.products[0];
  Object.assign(product, { initialUnits: 0, initialValue: 0, inventoryMode: 'manual' });
  s.expenses = [{ id: 'opex', label: 'Administración', category: 'administration', mode: 'manual', values: {} }, { id: 'dep', label: 'Depreciación', category: 'depreciation', mode: 'manual', values: {} }];
  Object.assign(s.result, { interestMode: 'manual', taxMode: 'manual', otherEnabled: true });
  Object.assign(s.advanced, { enabled: true, openingSource: 'manual', opening: Object.fromEntries(Object.keys(B.openingFields).map(k => [k, 0])), confirmed: true, baseSignature: B.signature(c), ...policies });
  Object.assign(s.advanced.opening, { cash: 200, receivables: 100, payables: 50, fixed: 100, longDebt: 200, equity: 150 });
  periods.forEach((p, i) => {
    product.values[p.key] = { units: [10, 20, 15][i], price: 100, unitCost: 40, targetUnits: 0 };
    s.expenses[0].values[p.key] = 50; s.expenses[1].values[p.key] = 10;
    s.result.interest[p.key] = 5; s.result.taxes[p.key] = 10; s.result.otherIncome[p.key] = 20; s.result.otherExpenses[p.key] = 7;
    s.advanced.values[p.key] = { capex: 30, dividends: 8, financing: 0, minimumCash: 0 };
  });
  c.params.budget = s; return { c, s, periods };
}

test('Cobros 20/50/30 y pagos 10/70/20 se reparten en tres períodos', () => {
  const r = B.analyze(fixture().c);
  assert.deepEqual(r.rows.map(x => x.sales), [1000, 2000, 1500]);
  assert.deepEqual(r.rows.map(x => x.currentCollections), [200, 400, 300]);
  assert.deepEqual(r.rows.map(x => x.creditCollectionsPrevious), [0, 500, 1000]);
  assert.deepEqual(r.rows.map(x => x.creditCollectionsEarlier), [0, 0, 300]);
  assert.deepEqual(r.rows.map(x => x.creditCollections), [0, 500, 1300]);
  assert.deepEqual(r.rows.map(x => x.collections), [300, 900, 1600]);
  assert.deepEqual(r.rows.map(x => x.purchases), [400, 800, 600]);
  assert.deepEqual(r.rows.map(x => x.currentPayments), [40, 80, 60]);
  assert.deepEqual(r.rows.map(x => x.creditPaymentsPrevious), [0, 280, 560]);
  assert.deepEqual(r.rows.map(x => x.creditPaymentsEarlier), [0, 0, 80]);
  assert.deepEqual(r.rows.map(x => x.payments), [90, 360, 700]);
});

test('Sin duplicados: cada venta o compra se cobra/paga una sola vez y el resto queda en saldos finales', () => {
  const r = B.analyze(fixture().c), last = r.rows.at(-1);
  // Pendiente de cobro: 80 % de 1,500 + 30 % de 2,000 = 1,800. Pendiente de pago: 90 % de 600 + 20 % de 800 = 700.
  near(last.receivables, 1800); near(last.payables, 700);
  near(r.totals.collections + last.receivables, 100 + r.totals.sales);
  near(r.totals.payments + last.payables, 50 + r.totals.purchases);
  near(r.totals.creditCollections, r.totals.creditCollectionsPrevious + r.totals.creditCollectionsEarlier);
});

test('Conectado al presupuesto de caja y al balance proforma', () => {
  const r = B.analyze(fixture().c);
  r.rows.forEach(row => near(row.cashInflows, row.collections + row.otherIncome));
  r.rows.forEach(row => near(row.cash, row.openingCash + row.cashInflows - row.cashOutflows + row.financing));
  near(r.closing.difference, 0);
  assert.deepEqual(r.issues.filter(t => /política/i.test(t)), []);
});

test('Cada política debe sumar 100 %', () => {
  let r = B.analyze(fixture({ collectionPolicy: { current: 20, next: 50, after: 20 }, paymentPolicy: { current: 10, next: 70, after: 20 } }).c);
  assert.ok(r.issues.some(t => /política de cobros debe sumar 100 % \(suma actual: 90 %\)/.test(t)), r.issues.join(' | '));
  assert.equal(r.rows[0].collections, null); assert.equal(r.rows[0].cash, null);
  r = B.analyze(fixture({ collectionPolicy: { current: 20, next: 50, after: 30 }, paymentPolicy: { current: 60, next: 70, after: 0 } }).c);
  assert.ok(r.issues.some(t => /política de pagos debe sumar 100 %/.test(t)));
  assert.equal(r.rows[0].payments, null);
  for (const bad of [-10, 120]) {
    r = B.analyze(fixture({ collectionPolicy: { current: bad, next: 50, after: 50 - bad }, paymentPolicy: { current: 100, next: 0, after: 0 } }).c);
    assert.equal(r.rows[0].collections, null);
  }
  r = B.analyze(fixture({ collectionPolicy: { current: 20, next: null, after: 30 }, paymentPolicy: { current: 100, next: 0, after: 0 } }).c);
  assert.equal(r.rows[1].collections, null, 'un porcentaje vacío queda pendiente, no es cero');
});

test('Casos límite: todo al contado y todo a dos períodos', () => {
  let r = B.analyze(fixture({ collectionPolicy: { current: 100, next: 0, after: 0 }, paymentPolicy: { current: 100, next: 0, after: 0 } }).c);
  assert.deepEqual(r.rows.map(x => x.creditCollections), [0, 0, 0]); near(r.rows.at(-1).receivables, 0);
  r = B.analyze(fixture({ collectionPolicy: { current: 0, next: 0, after: 100 }, paymentPolicy: { current: 0, next: 0, after: 100 } }).c);
  assert.deepEqual(r.rows.map(x => x.collections), [100, 0, 1000]);
  near(r.rows.at(-1).receivables, 3500);
});

test('Compatibilidad: proyecciones anteriores con % del mismo período dan el mismo resultado', () => {
  const legacy = fixture({ collectionPercent: 60, paymentPercent: 50 });
  const explicit = fixture({ collectionPolicy: { current: 60, next: 40, after: 0 }, paymentPolicy: { current: 50, next: 50, after: 0 } });
  const a = B.analyze(legacy.c), b = B.analyze(explicit.c);
  assert.deepEqual(a.rows.map(x => [x.collections, x.payments, x.cash, x.receivables, x.payables]), b.rows.map(x => [x.collections, x.payments, x.cash, x.receivables, x.payables]));
  assert.deepEqual(a.rows.map(x => x.creditCollections), [0, 400, 800]);
  // Al abrirla en la interfaz se muestra la política convertida.
  const upgraded = B.upgrade(legacy.c, legacy.s);
  assert.deepEqual(upgraded.advanced.collectionPolicy, { current: 60, next: 40, after: 0 });
  assert.deepEqual(upgraded.advanced.paymentPolicy, { current: 50, next: 50, after: 0 });
  assert.deepEqual(B.policyOf({ collectionPercent: null }, 'collection'), { current: null, next: null, after: null, legacy: true });
});

test('Recalcula automáticamente al cambiar ventas, compras o la política', () => {
  const { c, s, periods } = fixture();
  s.products[0].values[periods[0].key].price = 110;
  let r = B.analyze(c);
  near(r.rows[0].currentCollections, 220); near(r.rows[1].creditCollectionsPrevious, 550); near(r.rows[2].creditCollectionsEarlier, 330);
  s.products[0].values[periods[0].key].unitCost = 50;
  r = B.analyze(c); near(r.rows[1].creditPaymentsPrevious, 350);
  s.advanced.collectionPolicy = { current: 50, next: 50, after: 0 };
  r = B.analyze(c); near(r.rows[2].creditCollectionsEarlier, 0); near(r.rows[1].creditCollectionsPrevious, 550);
});
