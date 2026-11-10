'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const C = require('../assets/js/casos.js'), P = require('../assets/js/proforma.js');
const B = require('../assets/js/budget.js'), L = require('../assets/js/leverage.js');
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const line = (id, category, current, previous = current) => ({ id, name: id, category, sign: 1, amounts: { previous, current } });
function fixture() {
  const c = C.blankCase('Ejercicio didáctico de proforma');
  c.income = [line('sales', 'sales', 100000), line('cost', 'costSales', 60000), line('admin', 'opex', 15000),
    line('dep', 'opex', 5000), line('interest', 'interest', 2000), line('tax', 'taxes', 5400), line('other', 'otherIncome', 0)];
  const balances = { cash: 10000, receivables: 15000, inventory: 20000, fixed: 50000, payables: 12000, longDebt: 18000, equity: 65000 };
  c.balance = C.engine.defaultAccounts();
  c.balance.forEach(a => { a.amounts = { previous: balances[a.id] || 0, current: balances[a.id] || 0 }; });
  const s = P.newProjection(c);
  Object.assign(s, { start: '2026-01-01', end: '2026-12-31', salesValue: 20, dividends: 3600 });
  s.lines = { cost: { fixedPercent: 20 }, admin: { fixedPercent: 100 }, dep: { fixedPercent: 100, depreciation: true } };
  Object.assign(s.balance, { enabled: true, cash: 10000, capex: 10000, disposals: 0, equityChange: 0, retainedOpening: 25000 });
  return { c, s };
}
test('Porcentajes, ambas metodologías, utilidad neta y ganancias retenidas: solución conocida', () => {
  const { c, s } = fixture(), before = JSON.stringify(c), r = P.analyze(c, s);
  assert.equal(r.ready, true, JSON.stringify(r.income.issues));
  near(r.history.ratios.costSales, .6); near(r.history.ratios.opex, .2); near(r.history.ratios.interest, .02);
  const a = r.comparison.sales, b = r.comparison.mixed;
  for (const [key, expected] of Object.entries({ sales: 120000, costSales: 72000, operatingExpenses: 24000, grossProfit: 48000,
    ebit: 24000, interest: 2400, ebt: 21600, taxes: 6480, netProfit: 15120, retained: 11520 })) near(a[key], expected);
  for (const [key, expected] of Object.entries({ costSales: 69600, operatingExpenses: 20000, ebit: 30400,
    ebt: 28400, taxes: 8520, netProfit: 19880, retained: 16280, fixedCostSales: 12000, fixedCosts: 20000 })) near(b[key], expected);
  assert.equal(b.ready, true); assert.equal(JSON.stringify(c), before);
});
test('Método crítico: activos, obligaciones, patrimonio y excedente sin préstamo automático', () => {
  const { c, s } = fixture(), r = P.analyze(c, s), b = r.balance;
  assert.equal(b.ready, true, JSON.stringify(b.issues));
  for (const [key, expected] of Object.entries({ currentAssets: 52000, assets: 106000, liabilities: 32400, funding: 108920,
    difference: -2920, externalRequired: 0, surplus: 2920, depreciation: 6000, retainedClosing: 36520 })) near(b[key], expected);
  near(b.values.fixed, 54000); near(b.values.equity, 76520); near(b.values.cash, 10000); near(b.values.longDebt, 18000);
  s.balance.capex = 30000;
  const deficit = P.analyze(c, s).balance;
  near(deficit.assets, 126000); near(deficit.externalRequired, 17080); near(deficit.surplus, 0);
  near(deficit.values.longDebt, 18000); near(deficit.values.cash, 10000);
  s.balance.capex = 10000; s.balance.cash = 12920;
  near(P.analyze(c, s).balance.difference, 0);
});
test('El estado de resultados funciona sin balance ni presupuesto', () => {
  const { c, s } = fixture(); c.balance = []; s.balance.enabled = false;
  const r = P.analyze(c, s); assert.equal(r.income.ready, true); near(r.income.netProfit, 15120); assert.equal(r.balance.ready, false);
  s.balance.enabled = true;
  const partial = P.analyze(c, s); assert.equal(partial.income.ready, true); assert.equal(partial.balance.externalRequired, null);
});
test('Clasificación desconocida bloquea únicamente el método mixto', () => {
  const { c, s } = fixture(); s.lines = {};
  const r = P.analyze(c, s);
  assert.equal(r.comparison.sales.ready, true); assert.equal(r.comparison.mixed.ready, false);
  assert.equal(r.comparison.mixed.netProfit, null);
  assert.match(r.comparison.mixed.issues.join(' '), /confirma el porcentaje fijo/);
  for (const id of ['cost', 'admin', 'dep']) s.lines[id] = { fixedPercent: 0 };
  near(P.analyze(c, s).comparison.mixed.operatingExpenses, 24000);
});
test('Los componentes fijos explícitos del histórico se reutilizan sin inferir por nombre', () => {
  const { c, s } = fixture(); s.lines = {};
  c.income.push(line('fixed-cost', 'fixedCostSales', 12000), line('fixed-opex', 'fixedCosts', 20000));
  const r = P.analyze(c, s); assert.equal(r.comparison.mixed.ready, true);
  near(r.comparison.mixed.fixedCostSales, 12000); near(r.comparison.mixed.fixedCosts, 20000);
  c.income.find(a => a.id === 'fixed-opex').amounts.current = 10000;
  assert.equal(P.analyze(c, s).comparison.mixed.ready, false, 'No repartir un fijo agregado entre cuentas sin autorización');
});
test('Ajustes fijos e importes sustitutos se aplican una vez; depreciación enlazada', () => {
  const { c, s } = fixture(); s.method = 'mixed'; s.lines.admin.fixedGrowth = 10;
  let r = P.analyze(c, s); near(r.income.operatingExpenses, 21500); near(r.balance.depreciation, 5000);
  s.lines.dep.amount = 7000; r = P.analyze(c, s);
  near(r.income.operatingExpenses, 23500); near(r.balance.values.fixed, 53000); near(r.balance.depreciation, 7000);
  assert.equal(r.income.fixedCosts, null, 'Un sustituto total no inventa clasificación fija para apalancamiento');
  s.balance.depreciationMode = 'none'; assert.equal(P.analyze(c, s).balance.ready, false);
});
test('Cobros y pagos en días con crédito parcial y remanentes iniciales sin duplicación', () => {
  const { c, s } = fixture();
  Object.assign(s.balance, { days: 360, receivablesMode: 'days', salesCreditPercent: 80, collectionDays: 30,
    openingReceivablesRemaining: 2000, payablesMode: 'days', purchasesMode: 'inventory', purchasesCreditPercent: 50,
    paymentDays: 45, openingPayablesRemaining: 1000 });
  let b = P.analyze(c, s).balance;
  assert.equal(b.ready, true, JSON.stringify(b.issues)); near(b.values.receivables, 10000); near(b.values.purchases, 76000); near(b.values.payables, 5750);
  s.balance.collectionDays = 1000; near(P.analyze(c, s).balance.values.receivables, 98000);
  s.balance.openingReceivablesRemaining = 16000; assert.equal(P.analyze(c, s).balance.ready, false);
  s.balance.openingReceivablesRemaining = null; assert.equal(P.analyze(c, s).balance.values.receivables, null);
});
test('Saldos explícitos, deuda, capital y tasas recalculan todos sus dependientes', () => {
  const { c, s } = fixture();
  Object.assign(s.balance, { receivablesMode: 'amount', receivables: 5000, inventoryMode: 'amount', inventory: 7000,
    payablesMode: 'amount', payables: 8000, longDebt: 5000, equityChange: -1000, otherCurrentLiabilities: 3000 });
  Object.assign(s, { taxMode: 'rate', taxRate: 20, dividendMode: 'percent', dividends: 25 });
  const r = P.analyze(c, s);
  near(r.income.netProfit, 17280); near(r.income.dividends, 4320); near(r.income.retained, 12960);
  near(r.balance.assets, 76000); near(r.balance.liabilities, 16000); near(r.balance.values.equity, 76960);
  near(r.balance.surplus, 16960);
});
test('Histórico modificado y período anterior vuelven a calcular porcentajes', () => {
  const { c, s } = fixture(); s.salesMode = 'amount'; s.salesValue = 120000;
  c.income.find(a => a.id === 'sales').amounts.current = 200000;
  let r = P.analyze(c, s); near(r.history.ratios.costSales, .3); near(r.income.costSales, 36000);
  s.historicalPeriod = 'previous'; s.historicalEnd = '2024-12-31'; r = P.analyze(c, s);
  near(r.history.ratios.costSales, .6); near(r.income.costSales, 72000);
});
test('No se sustituyen categorías ni cuentas vacías por cero, aunque exista otra del mismo grupo', () => {
  for (const category of ['sales', 'costSales', 'opex', 'interest', 'taxes', 'otherIncome']) {
    const { c, s } = fixture(); c.income.find(a => a.category === category).amounts.current = null;
    assert.equal(P.analyze(c, s).income.ready, false, category);
  }
  const { c, s } = fixture(); c.balance.find(a => a.id === 'inventory').amounts.current = null;
  const r = P.analyze(c, s); assert.equal(r.balance.ready, false); assert.equal(r.balance.externalRequired, null); assert.equal(r.income.ready, true);
});
test('Ceros explícitos, ventas base cero, caída de 100 %, pérdidas y beneficio fiscal', () => {
  const { c, s } = fixture(); s.salesValue = -100; s.method = 'mixed'; s.dividends = 0;
  let r = P.analyze(c, s); assert.equal(r.income.ready, true); near(r.income.sales, 0); near(r.income.netProfit, -34000); near(r.income.taxes, 0);
  assert.equal(r.income.margin, null);
  s.taxLoss = 'credit'; r = P.analyze(c, s); near(r.income.taxes, -10200); near(r.income.netProfit, -23800);
  c.income.find(a => a.id === 'sales').amounts.current = 0;
  r = P.analyze(c, s); assert.equal(r.ready, false); assert.match(r.issues.join(' '), /ventas históricas positivas/);
});
test('Tasa histórica no derivable exige tasa explícita', () => {
  const { c, s } = fixture(); c.income.find(a => a.id === 'cost').amounts.current = 100000;
  c.income.find(a => a.id === 'tax').amounts.current = 0;
  let r = P.analyze(c, s); assert.equal(r.income.netProfit, null);
  Object.assign(s, { taxMode: 'rate', taxRate: 30 }); r = P.analyze(c, s); near(r.income.taxes, 0); assert.equal(r.ready, true);
});
test('Validación de límites, importes, porcentajes, tasas y fechas reales', () => {
  const invalid = [s => s.salesValue = -101, s => s.salesValue = 1e16, s => s.salesValue = NaN,
    s => s.salesValue = '', s => s.start = '2026-02-30', s => s.end = '2025-12-01',
    s => s.start = '2025-01-01', s => s.historicalEnd = '2024-12-31', s => s.method = 'unknown',
    s => { s.taxMode = 'rate'; s.taxRate = 100; }, s => s.dividends = -1,
    s => { s.method = 'mixed'; s.lines.cost.fixedPercent = 101; }, s => { s.method = 'mixed'; s.lines.cost.fixedGrowth = -101; }];
  for (const change of invalid) { const { c, s } = fixture(); change(s); assert.equal(P.analyze(c, s).ready, false, String(change)); }
  const { c, s } = fixture(); s.salesMode = 'amount'; s.salesValue = 1e15;
  assert.equal(P.analyze(c, s).income.ready, true);
});
test('Año bisiesto, período mensual y etiquetas históricas sin fecha', () => {
  const { c, s } = fixture(); c.periods.current = '2023'; s.context = P.context(c); s.historicalEnd = '2023-12-31';
  s.start = '2024-01-01'; s.end = '2024-12-31'; near(P.analyze(c, s).days, 366);
  assert.equal(P.historicalEnd('2024-02'), '2024-02-29'); assert.equal(P.historicalEnd('2024-02-30'), '');
  c.periods.current = 'Segundo trimestre'; s.context = P.context(c); s.historicalEnd = '';
  assert.equal(P.analyze(c, s).ready, false); s.historicalEnd = '2023-06-30'; assert.equal(P.analyze(c, s).ready, true);
});
test('Ausencia de rubros necesita confirmación; un histórico descuadrado no se ajusta', () => {
  const { c, s } = fixture(); c.balance = c.balance.filter(a => a.id !== 'longDebt');
  c.balance.find(a => a.id === 'equity').amounts.current = 83000;
  assert.equal(P.analyze(c, s).balance.ready, false);
  s.balance.absentZero = true; assert.equal(P.analyze(c, s).balance.ready, true);
  c.balance.find(a => a.id === 'equity').amounts.current++;
  const r = P.analyze(c, s); assert.equal(r.balance.ready, false); assert.equal(r.balance.externalRequired, null);
  assert.match(r.balance.issues.join(' '), /histórico no cuadra/);
});
test('Activos fijos negativos y compras negativas quedan pendientes, sin ajuste inventado', () => {
  const { c, s } = fixture(); s.balance.disposals = 100000;
  assert.equal(P.analyze(c, s).balance.ready, false);
  s.balance.disposals = 0; s.balance.payablesMode = 'days'; s.balance.purchasesMode = 'manual'; s.balance.purchases = -1;
  assert.equal(P.analyze(c, s).balance.externalRequired, null);
});
test('Dayton: importes y tasa del caso académico, sin modificar su escala', () => {
  const c = C.samples.dayton(), s = P.newProjection(c);
  Object.assign(s, { start: '2013-01-01', end: '2013-12-31', salesValue: 20, dividends: 1000 });
  const r = P.analyze(c, s); assert.equal(r.ready, true);
  near(r.income.sales, 214690.8); near(r.income.ebt, 16711.2); near(r.income.taxes, 5903.064288);
  near(r.income.netProfit, 10808.135712); near(r.income.retained, 9808.135712);
  assert.equal(c.scale, 'miles'); assert.equal(c.currency, 'U$'); assert.equal(C.fmt.money(r.income.netProfit, c), 'U$ 10,808.14');
});
test('El Buen Precio: el estado del ejercicio funciona como histórico sin presupuesto', () => {
  const fixture = require('./fixtures/buen-precio.json').sheets['Estado de resultados'].values;
  const c = C.blankCase('El Buen Precio · histórico trimestral'); c.periods.current = '2026-12';
  c.income = [['sales', 3], ['costSales', 4], ['opex', 6], ['interest', 8], ['taxes', 10]].map(([category, index]) => line(category, category, fixture[index][4]));
  const s = P.newProjection(c); Object.assign(s, { start: '2027-01-01', end: '2027-03-31', salesValue: 0, dividends: 0 });
  const r = P.analyze(c, s); assert.equal(r.ready, true); near(r.income.sales, 351000); near(r.income.grossProfit, 145800);
  near(r.income.ebit, 89400); near(r.income.netProfit, 60900); near(r.income.retained, 60900);
  assert.equal(c.params.budget, undefined);
});
test('Guardado separado, varias proyecciones, cambios de contexto y presupuestos anteriores intactos', () => {
  const { c, s } = fixture(); c.params.budget = B.blank(c); c.params.budgetProjections = [{ id: 'legacy', name: 'Anterior' }];
  const budget = JSON.stringify([c.params.budget, c.params.budgetProjections]), before = JSON.stringify(c);
  let saved = P.saveProjection(c, s); const second = P.newProjection(c); second.name = 'Alternativa';
  saved = P.saveProjection(saved, second); assert.equal(saved.params.proformaProjections.length, 2);
  assert.equal(JSON.stringify([saved.params.budget, saved.params.budgetProjections]), budget); assert.equal(JSON.stringify(c), before);
  saved = P.saveProjection(saved, s); assert.equal(saved.params.proformaProjections.length, 2);
  near(P.analyze(saved).income.netProfit, 15120);
  const independent = P.analyze(saved).income.netProfit; saved.params.budget.mode = 'cash'; saved.params.budget.months = [];
  near(P.analyze(saved).income.netProfit, independent);
  for (const key of ['currency', 'scale', 'periods']) {
    const changed = structuredClone(saved); changed[key] = key === 'periods' ? { previous: '2030', current: '2031' } : 'distinto';
    assert.equal(P.analyze(changed).stale, true); assert.equal(P.analyze(changed).ready, false);
    assert.throws(() => P.saveProjection(changed, s), /contexto/);
  }
});
test('Motor proforma cargado en navegador sin FinoraBudget ni localStorage', () => {
  const sandbox = vm.createContext({ console });
  for (const file of ['finance.js', 'casos.js', 'proforma.js']) vm.runInContext(fs.readFileSync(require.resolve('../assets/js/' + file), 'utf8'), sandbox);
  assert.equal(vm.runInContext('typeof FinoraBudget', sandbox), 'undefined');
  assert.equal(vm.runInContext('FinoraProforma.analyze(FinoraCasos.samples.dayton()).ready', sandbox), false);
  const html = fs.readFileSync(require.resolve('../modulos/proforma/index.html'), 'utf8');
  assert.doesNotMatch(html, /src="[^\"]*budget\.js/);
});
test('Apalancamiento conserva la proyección independiente y utiliza su clasificación explícita', () => {
  const { c, s } = fixture(); s.method = 'mixed'; const saved = P.saveProjection(c, s), r = P.analyze(saved), l = L.analyze(saved);
  assert.equal(l.unavailable, false, l.reason); near(l.ebit, r.income.ebit); near(l.ebt, r.income.ebt); near(l.fc, 32000);
  near(l.gao, 62400 / 30400); near(L.scenario(l, 10).ebit, 36640);
  s.method = 'sales'; assert.equal(L.analyze(P.saveProjection(c, s)).unavailable, true, 'No se infiere clasificación para el método porcentual');
});
test('Signos de contracuentas y redondeo conservan el resultado calculado', () => {
  const { c, s } = fixture(); c.income.push({ ...line('rebate', 'costSales', 1000), sign: -1 });
  c.income.find(a => a.id === 'tax').amounts.current = 5700;
  s.lines.rebate = { fixedPercent: 0 };
  const r = P.analyze(c, s); near(r.income.costSales, 70800); near(r.income.netProfit, 15960);
  assert.equal(r.income.rows.find(row => row.key === 'rebate').ratio, -.01);
  s.salesMode = 'amount'; s.salesValue = 123456.78;
  near(P.analyze(c, s).income.costSales, 72839.5002);
});
