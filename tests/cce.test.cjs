'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js');
const A = require('../assets/js/financial-analysis.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// Helper para calcular métricas temporales del CCE
function cceTimelineData(invDays, colDays, payDays) {
  if (!Number.isFinite(invDays) || !Number.isFinite(colDays) || !Number.isFinite(payDays)) {
    return { valid: false };
  }
  const operatingCycle = invDays + colDays;
  const cce = operatingCycle - payDays;
  const maxDays = Math.max(operatingCycle, payDays, 1);

  // Posiciones porcentuales proporcionales
  const posCompra = 0;
  const posVenta = (invDays / maxDays) * 100;
  const posPago = (payDays / maxDays) * 100;
  const posCobro = (operatingCycle / maxDays) * 100;

  // Secuencia temporal de eventos
  const events = [
    { name: 'compra', day: 0, pos: posCompra },
    { name: 'venta', day: invDays, pos: posVenta },
    { name: 'pago', day: payDays, pos: posPago },
    { name: 'cobro', day: operatingCycle, pos: posCobro }
  ].sort((a, b) => a.day - b.day || a.pos - b.pos);

  // Tramo de financiamiento
  const gapStart = Math.min(payDays, operatingCycle);
  const gapEnd = Math.max(payDays, operatingCycle);
  const gapDays = Math.abs(cce);
  const gapPosStart = (gapStart / maxDays) * 100;
  const gapPosWidth = (gapDays / maxDays) * 100;

  return {
    valid: true,
    invDays,
    colDays,
    payDays,
    operatingCycle,
    cce,
    maxDays,
    posCompra,
    posVenta,
    posPago,
    posCobro,
    events,
    gapStart,
    gapEnd,
    gapDays,
    gapPosStart,
    gapPosWidth,
    status: cce > 0 ? 'gap' : cce < 0 ? 'surplus' : 'balanced'
  };
}

test('CCE Positivo: el pago a proveedores ocurre antes del cobro a clientes', () => {
  const d = cceTimelineData(60, 40, 30);
  assert.equal(d.valid, true);
  near(d.operatingCycle, 100);
  near(d.cce, 70);
  assert.equal(d.status, 'gap');
  near(d.maxDays, 100);

  // Secuencia: Compra (0) -> Pago (30) -> Venta (60) -> Cobro (100)
  assert.deepEqual(d.events.map(e => e.name), ['compra', 'pago', 'venta', 'cobro']);
  near(d.posCompra, 0);
  near(d.posPago, 30);
  near(d.posVenta, 60);
  near(d.posCobro, 100);

  // Brecha CCE: desde día 30 hasta día 100 (70 días a financiar)
  near(d.gapStart, 30);
  near(d.gapEnd, 100);
  near(d.gapPosStart, 30);
  near(d.gapPosWidth, 70);
});

test('CCE Positivo con pago posterior a la venta pero antes del cobro', () => {
  const d = cceTimelineData(40, 50, 60);
  assert.equal(d.valid, true);
  near(d.operatingCycle, 90);
  near(d.cce, 30);
  assert.equal(d.status, 'gap');
  near(d.maxDays, 90);

  // Secuencia: Compra (0) -> Venta (40) -> Pago (60) -> Cobro (90)
  assert.deepEqual(d.events.map(e => e.name), ['compra', 'venta', 'pago', 'cobro']);
  near(d.gapStart, 60);
  near(d.gapEnd, 90);
  near(d.gapDays, 30);
});

test('CCE Negativo: el cobro a clientes ocurre antes del pago a proveedores', () => {
  const d = cceTimelineData(20, 20, 60);
  assert.equal(d.valid, true);
  near(d.operatingCycle, 40);
  near(d.cce, -20);
  assert.equal(d.status, 'surplus');
  near(d.maxDays, 60);

  // Secuencia: Compra (0) -> Venta (20) -> Cobro (40) -> Pago (60)
  assert.deepEqual(d.events.map(e => e.name), ['compra', 'venta', 'cobro', 'pago']);
  near(d.posCobro, (40 / 60) * 100);
  near(d.posPago, 100);

  // Brecha de autofinanciamiento: desde día 40 hasta día 60 (20 días de financiamiento libre)
  near(d.gapStart, 40);
  near(d.gapEnd, 60);
  near(d.gapDays, 20);
});

test('CCE Cero: cobro y pago se realizan simultáneamente', () => {
  const d = cceTimelineData(30, 30, 60);
  assert.equal(d.valid, true);
  near(d.operatingCycle, 60);
  near(d.cce, 0);
  assert.equal(d.status, 'balanced');
  near(d.gapDays, 0);
  near(d.posPago, d.posCobro);
});

test('Datos faltantes o incompletos: valid es false sin números inventados', () => {
  assert.equal(cceTimelineData(null, 30, 40).valid, false);
  assert.equal(cceTimelineData(30, undefined, 40).valid, false);
  assert.equal(cceTimelineData(30, 30, NaN).valid, false);
});

test('Integración con caso Dayton: el motor calcula CCE real consistente', () => {
  const c = C.samples.dayton();
  c.params = { academicAnalysis: { current: { creditSales: 150000, purchaseRate: 70 } } };
  const res = A.analyze(c);
  const act = res.current?.activity;

  assert.ok(act);
  assert.ok(Number.isFinite(act.cce));
  near(act.cce, -11.007366);

  const m = act.metrics;
  near(m.inventoryDays.value, 26.571225);
  near(m.collectionDays.value, 49.532933);
  near(m.paymentDays.value, 87.111525);

  const tl = cceTimelineData(m.inventoryDays.value, m.collectionDays.value, m.paymentDays.value);
  assert.equal(tl.valid, true);
  near(tl.cce, act.cce);
  assert.equal(tl.status, 'surplus');
});
