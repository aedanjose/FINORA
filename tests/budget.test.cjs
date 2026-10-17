'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js');
const B = require('../assets/js/budget.js');
const I = require('../assets/js/budget-import.js');
const T = require('../assets/js/file-table.js');
const XLSX = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function fixture() {
  const c = C.blankCase('Empresa de prueba');
  const s = B.blank(c);
  Object.assign(s, { openingSource: 'manual', inventoryUnits: 18, inventoryPercent: 20, nextUnits: 140,
    collectionPercent: 60, paymentPercent: 50, confirmed: true, baseSignature: B.signature(c),
    opening: Object.fromEntries(Object.keys(B.openingFields).map(k => [k, 0])) });
  Object.assign(s.opening, { cash: 10000, inventory: 5040, equity: 15040 });
  s.months = [80,100,120].map((units, index) => ({ month: `2026-${10 + index}`, ...Object.fromEntries(Object.keys(B.fields).map(k => [k, 0])), units, price: 500, unitCost: 280 }));
  c.params.budget = s;
  return c;
}
test('Referencia independiente: ventas, compras, costo y utilidad del trimestre', () => {
  const c = fixture(), original = structuredClone(c), r = B.analyze(c);
  assert.equal(r.status, 'ready'); assert.deepEqual(r.issues, []);
  assert.deepEqual(r.rows.map(row => row.purchaseUnits), [82,104,124]);
  near(r.totals.sales, 150000); near(r.totals.purchases, 86800);
  near(r.totals.costSales, 84000); near(r.totals.netProfit, 66000);
  near(r.closing.inventory, 7840); near(r.closing.cash, 66560);
  near(r.closing.receivables, 24000); near(r.closing.payables, 17360);
  near(r.closing.assets, 98400); near(r.closing.funding, 98400);
  assert.deepEqual(c, original, 'Calcular no muta las cuentas ni el presupuesto');
});
test('Cada saldo final alimenta el mes siguiente; saldos por cobrar/pagar iniciales se liquidan una vez', () => {
  const c = fixture(), s = c.params.budget;
  Object.assign(s.opening, { receivables: 4000, payables: 3000, equity: 16040 });
  const r = B.analyze(c);
  near(r.rows[0].collections, 28000); near(r.rows[0].payments, 14480);
  near(r.rows[1].collections, 46000); near(r.rows[1].openingCash, r.rows[0].cash);
  near(r.closing.difference, 0);
});
test('Costo promedio ponderado conserva el valor cuando cambia el costo de compra', () => {
  const c = fixture(); c.params.budget.months[0].unitCost = 300;
  const r = B.analyze(c);
  near(r.rows[0].averageCost, 296.4); near(r.rows[0].costSales, 23712);
  near(r.rows[0].inventory, 5928);
  near(r.totals.costSales + r.closing.inventory, r.opening.inventory + r.totals.purchases);
  near(r.closing.difference, 0);
});
test('El exceso de inventario no genera compras negativas ni devoluciones ficticias', () => {
  const c = fixture(), s = c.params.budget;
  s.inventoryUnits = 500; s.opening.inventory = 140000; s.opening.equity = 150000;
  const r = B.analyze(c);
  assert.equal(r.rows[0].purchaseUnits, 0); assert.equal(r.rows[0].endingUnits, 420);
  assert.ok(r.warnings.some(w => /supera el objetivo/.test(w))); near(r.closing.difference, 0);
});
test('Ceros explícitos calculan; vacíos y valores ilegibles permanecen pendientes', () => {
  const c = fixture(), s = c.params.budget;
  s.months = [s.months[0]]; s.inventoryUnits = 0; s.nextUnits = 0;
  for (const k of Object.keys(s.opening)) s.opening[k] = 0;
  for (const k of Object.keys(B.fields)) s.months[0][k] = 0;
  let r = B.analyze(c); assert.equal(r.ready, true); assert.equal(r.closing.cash, 0); assert.equal(r.totals.netProfit, 0);
  s.months[0].units = null; r = B.analyze(c); assert.equal(r.ready, false); assert.equal(r.totals.sales, null); assert.equal(r.closing.cash, null);
  s.months[0].units = 'ilegible'; assert.doesNotThrow(() => B.analyze(c)); assert.equal(B.analyze(c).totals.sales, null);
  const empty = B.analyze(C.blankCase()); assert.equal(empty.ready, false); assert.equal(empty.totals.sales, null); assert.equal(empty.closing.assets, null);
});
test('No se infieren políticas, costos, otros ingresos, gastos ni impuestos ausentes', () => {
  for (const field of ['unitCost','opex','depreciation','otherIncome','taxes']) {
    const c = fixture(); c.params.budget.months[0][field] = null;
    const r = B.analyze(c); assert.equal(r.ready, false); assert.equal(r.totals.netProfit, null);
  }
  const c = fixture(); c.params.budget.collectionPercent = null;
  assert.equal(B.analyze(c).rows[0].collections, null);
});
test('Depreciación, inversiones, préstamos y dividendos cuadran en resultados, caja y balance', () => {
  const c = fixture(), s = c.params.budget;
  s.opening.fixed = 5000; s.opening.longDebt = 2000; s.opening.equity += 3000;
  Object.assign(s.months[0], { opex: 1000, depreciation: 200, otherIncome: 300, interest: 100, taxes: 500, capex: 1000, financing: -500, dividends: 400 });
  const r = B.analyze(c);
  // 40,000 − 22,400 − 1,000 − 200 + 300 − 100 − 500 = 16,100.
  near(r.rows[0].netProfit, 16100); near(r.closing.fixed, 5800); near(r.closing.longDebt, 1500);
  near(r.closing.equity, 82140); near(r.closing.difference, 0);
});
test('Déficit de caja se conserva visible y no se convierte en financiamiento inventado', () => {
  const c = fixture(); c.params.budget.months[0].opex = 100000;
  const r = B.analyze(c); assert.equal(r.status, 'review'); assert.ok(r.rows[0].cash < 0);
  assert.equal(r.rows[0].financing, 0); near(r.closing.difference, 0);
});
test('Fechas, porcentajes, deuda y saldos iniciales inconsistentes bloquean el estado completo', () => {
  const changes = [s => s.months[1].month = s.months[0].month, s => s.collectionPercent = 101,
    s => s.months[0].depreciation = 1, s => s.opening.equity += 1, s => s.months[0].financing = -1,
    s => s.months[0].units = -1, s => s.inventoryUnits = 0, s => s.confirmed = false];
  for (const change of changes) { const c = fixture(); change(c.params.budget); assert.equal(B.analyze(c).ready, false); }
});
test('Un cambio de moneda, escala o años no reutiliza silenciosamente el presupuesto anterior', () => {
  for (const change of [c => c.currency = 'USD', c => c.scale = 'miles', c => c.periods.current = '2027']) {
    const c = fixture(); change(c); const r = B.analyze(c);
    assert.equal(r.stale, true); assert.equal(r.totals.sales, null); assert.equal(r.ready, false);
  }
  const c = fixture(); c.balance[0].amounts.current = 10;
  assert.equal(B.analyze(c).ready, false, 'Cambiar la base exige revisar supuestos');
});
test('Modo automático usa el balance real y conserva otros activos y pasivos', () => {
  const c = fixture(), s = c.params.budget;
  Object.assign(s.opening, { otherCurrentAssets: 123, otherCurrentLiabilities: 100, equity: s.opening.equity + 23 });
  c.balance = C.engine.accountsFromBalances({ current: s.opening });
  s.openingSource = 'automatic'; s.baseSignature = B.signature(c);
  const r = B.analyze(c); assert.equal(r.ready, true); near(r.closing.otherCurrentAssets, 123); near(r.closing.otherCurrentLiabilities, 100); near(r.closing.difference, 0);
  c.balance.find(a => a.role === 'cash').amounts.current = null;
  assert.equal(B.analyze(c).ready, false); assert.equal(B.analyze(c).opening.cash, null);
});
test('Importación XLSX y CSV: columnas reconocidas, signos, decimales y sin mutar la empresa', () => {
  const headers = Object.values(I.labels), keys = Object.keys(I.labels);
  const c = fixture(), original = structuredClone(c); c.params.budget.months[0].financing = -100;
  const rows = [headers, ...c.params.budget.months.map(row => keys.map(k => row[k]))];
  for (const extension of ['xlsx','csv']) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Previsiones');
    const bytes = extension === 'xlsx' ? XLSX.write(wb, {type:'buffer',bookType:'xlsx'}) : Buffer.from(XLSX.utils.sheet_to_csv(wb.Sheets.Previsiones));
    const read = T.read(bytes, `previsiones.${extension}`, XLSX);
    const parsed = T.sheetData(read, read.SheetNames[0], XLSX);
    assert.deepEqual(I.parse(parsed, I.suggest(parsed.rows[0])), c.params.budget.months);
  }
  assert.deepEqual(c.balance, original.balance);
});
test('Importación permite columnas manuales y rechaza duplicados, fórmulas con errores y números ilegibles', () => {
  const data = {rows:[['Fecha','Cantidad','Precio'],['2026-10',0,'500.25']]};
  assert.equal(I.parse(data,{month:0,units:1,price:2})[0].price, 500.25);
  assert.equal(I.parse(data,{month:0,units:1})[0].unitCost, null);
  assert.throws(() => I.parse(data,{month:0,units:0}), /columna/);
  assert.throws(() => I.parse({...data,problems:[{r:1,c:2,address:'C2',message:'Error de fórmula'}]},{month:0,units:1,price:2}), /C2/);
  assert.throws(() => I.parse({rows:[data.rows[0],['2026-10','abc',1]]},{month:0,units:1}), /inválido/);
  assert.throws(() => I.parse({rows:[data.rows[0],['2026-10',1],['2026-10',2]]},{month:0,units:1}), /consecutivos/);
});
module.exports = { fixture };
