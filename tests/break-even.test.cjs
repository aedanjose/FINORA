'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js');
const B = require('../assets/js/break-even.js');
const close = (a, b, digits = 6) => assert.ok(Math.abs(a - b) < 10 ** -digits, `esperado ${b}, obtenido ${a}`);

test('Propone fijo o variable por el nombre y la categoría', () => {
  const p = (name, category = 'opex') => B.proposeBehavior({ name, category });
  assert.equal(p('Costo de bienes vendidos', 'costSales').behavior, 'variable');
  assert.equal(p('Materia prima', 'costSales').behavior, 'variable');
  assert.equal(p('Depreciación de planta', 'costSales').behavior, 'fixed');
  assert.equal(p('Alquiler del local').behavior, 'fixed');
  assert.equal(p('Sueldos administrativos').behavior, 'fixed');
  assert.equal(p('Comisiones sobre ventas').behavior, 'variable');
  assert.equal(p('Fletes de entrega').behavior, 'variable');
  const mixed = p('Gastos de ventas, generales y administración');
  assert.equal(mixed.behavior, 'fixed'); assert.equal(mixed.doubtful, true);
  assert.equal(p('Gastos de venta').doubtful, true);
  assert.equal(p('Gastos varios').doubtful, true);
  assert.equal(p('Otros gastos fiscales').behavior, 'fixed');
});

test('Dayton 2012: equilibrio con los gastos operativos fijos y el costo de ventas variable', () => {
  const r = B.analyze(C.samples.dayton(), 'current');
  assert.equal(r.ok, true, r.error || r.missing.join(', '));
  close(r.sales, 178909); close(r.variableCosts, 109701); close(r.contribution, 69208);
  close(r.fixedCosts, 12356 + 12103 + 33572);
  close(r.contributionRatio, 69208 / 178909, 12);
  close(r.breakEvenSales, 58031 / (69208 / 178909), 6);
  close(r.safetyMargin, (178909 - 58031 / (69208 / 178909)) / 178909, 12);
  close(r.ebit, 11177);
  assert.equal(r.doubtful, 1); // «Gastos de ventas, generales y administración»
  assert.equal(r.units, undefined);
});

test('El comportamiento elegido por el usuario cambia el cálculo y se respeta', () => {
  const c = C.samples.dayton();
  c.income.find(a => a.name.startsWith('Gastos de ventas')).behavior = 'variable';
  const r = B.analyze(c, 'current');
  close(r.variableCosts, 109701 + 12356); close(r.fixedCosts, 12103 + 33572);
  close(r.breakEvenSales, (12103 + 33572) / ((178909 - 109701 - 12356) / 178909), 6);
  assert.equal(r.doubtful, 0);
  assert.equal(B.costLines(c).find(l => l.name.startsWith('Gastos de ventas')).chosen, true);
  // Un costo fijo dentro del costo de ventas se separa de la contribución.
  const d = C.samples.dayton();
  d.income.find(a => a.category === 'costSales').behavior = 'fixed';
  const all = B.analyze(d, 'current');
  close(all.contribution, 178909); close(all.fixedCosts, 109701 + 58031);
  assert.equal(all.costSalesFullyVariable, false);
});

test('En unidades solo con el precio de venta por unidad', () => {
  const c = C.samples.dayton();
  c.breakEven = { unitPrice: 50 };
  const r = B.analyze(c, 'current');
  close(r.units.sold, 178909 / 50); close(r.units.breakEven, r.breakEvenSales / 50);
  close(r.units.variableCostPerUnit, 109701 / (178909 / 50));
  assert.equal(r.units.breakEvenWhole, Math.ceil(r.breakEvenSales / 50));
  c.breakEven.unitPrice = 0; assert.equal(B.analyze(c, 'current').units, undefined);
});

test('Sin estado de resultados o con categorías faltantes explica qué falta', () => {
  const mm = B.analyze(C.samples['mundo-moda'](), 'current');
  assert.equal(mm.ok, false); assert.deepEqual(mm.missing, ['el estado de resultados de este año']);
  const c = C.samples.dayton(); c.income = c.income.filter(a => a.category !== 'interest');
  const r = B.analyze(c, 'current');
  assert.equal(r.ok, false); assert.ok(r.missing.some(m => /gastos financieros/.test(m)));
  const both = B.analyzeBoth(C.samples.dayton());
  assert.equal(both.previous.ok, true);
  close(both.previous.breakEvenSales, 54221 / ((187510 - 111631) / 187510), 6);
});
