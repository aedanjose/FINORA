// Pruebas del análisis por cuentas contra las hojas resueltas en clase.
// Ejecutar sin Node instalado: ELECTRON_RUN_AS_NODE=1 "<VS Code>/Code.exe" tests/casos.test.cjs
'use strict';
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}\n     ${error.message}`); }
}
const close = (actual, expected, digits = 6, label = '') => assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${label} esperado ${expected}, obtenido ${actual}`);
const row = (analysis, label, type) => { const r = analysis.rows.find(x => x.label.trim() === label && (!type || x.type === type)); assert.ok(r, `fila «${label}» no encontrada`); return r; };

const mm = C.samples['mundo-moda']();
const mb = C.analyzeBalance(mm);

// Hoja «Análisis financiero» del Excel: [cuenta, vertical 2018, vertical 2019, variación absoluta, variación %]
const excel = [
  ['Banco', 0.1013706646777016, 0.23852035692799545, 172633.2, 1.9541463856376358],
  ['Cliente', 0.10028973866146476, 0.047957201177452016, -34928, -0.3996338672768879],
  ['IVA x cobrar', 0.02453656157663731, 0.05118808820333919, 34624.05, 1.6192325679277932],
  ['Inventario', 0.11285464299033249, 0.03177191996744482, -63587, -0.6465378749364514],
  ['Seguro pagado x Ad.', 0.02340858888665768, 0.01864474203422818, 0, 0],
  ['Equipo de transporte', 0.48194153590177574, 0.5595570411434162, 192235, 0.45770238095238097],
  ['Depreciación acumulada Trans.', 0.008032358931696262, 0.015308795542809905, 9750, 1.3928571428571428],
  ['Equipo de oficina', 0.09638830718035514, 0.048639013802821346, -30782, -0.366452380952381],
  ['Depreciación acum. Equ. de ofi.', 0.0016064717863392523, 0.00172738051199467, 490, 0.35],
  ['Franquicias', 0.06884879084311082, 0, -60000, -1],
  ['Otros activos', 0, 0.020757812798107376, 22712, null],
  ['Proveedor', 0.09540147451160388, 0.09005684589915068, 15395, 0.18516959345681983],
  ['IVA x pagar', 0.047247482716084796, 0.06177099001523796, 26411.25, 0.6414389799635701],
  ['IR x pagar', 0.029197624716715914, 0.04144867817690067, 19905.75, 0.7823049715071724],
  ['Acreedor', 0.021687369115579908, 0.021313499227362805, 4420, 0.23386243386243386],
  ['Préstamos', 0.13196018244929572, 0.08755717092544411, -19200, -0.16695652173913045],
  ['Capital social', 0.5737399236925902, 0.5483747657125936, 100000, 0.2],
  ['Utilidades', 0.1007659427981296, 0.1494780500433102, 75735.25, 0.862440926948699]
];
test('Mundo Moda: vertical y horizontal de las 18 cuentas coinciden con el Excel', () => {
  excel.forEach(([name, v18, v19, abs, rel]) => {
    const r = row(mb, name, 'account');
    close(r.verticalBefore, v18, 12, `${name} vertical 2018`);
    close(r.verticalAfter, v19, 12, `${name} vertical 2019`);
    close(r.absolute, abs, 6, `${name} variación absoluta`);
    if (rel === null) assert.equal(r.relative, null, `${name}: base cero sin variación %`);
    else close(r.relative, rel, 12, `${name} variación %`);
  });
});
test('Mundo Moda: subtotales, netos y totales del Excel', () => {
  const expect = [
    ['Total activos circulantes', 315875, 424617.25, 0.34425722200237435],
    ['Equipo de transporte neto', 413000, 595485, 0.44185230024213074],
    ['Equipo de oficina neto', 82600, 51328, -0.3785956416464891],
    ['Total activos no circulantes', 495600, 646813, 0.3051109765940274],
    ['Total otros activos', 60000, 22712, -0.6214666666666666],
    ['Total activos', 871475, 1094142.25, 0.2555061820476778],
    ['Total pasivo de corto plazo', 168660, 234792, 0.392102454642476],
    ['Total pasivo de largo plazo', 115000, 95800, -0.16695652173913045],
    ['Total pasivo', 283660, 330592, 0.16545159698230275],
    ['Total capital', 587815, 763550.25, 0.2989635344453612],
    ['Total pasivo y capital', 871475, 1094142.25, 0.2555061820476778]
  ];
  expect.forEach(([label, a, b, rel]) => { const r = row(mb, label); close(r.before, a, 6, label); close(r.after, b, 6, label); close(r.relative, rel, 12, label); });
  close(row(mb, 'Total activos no circulantes').verticalAfter, 0.591159878891433, 12);
  close(row(mb, 'Total pasivo').verticalBefore, 0.32549413350928025, 12);
  assert.deepEqual(mb.balanced, { previous: true, current: true });
});
test('Mundo Moda: los totales coinciden con los del motor', () => {
  for (const side of C.SIDES) {
    close(mb.engine[side].assets, mb.totals.assets[side], 6);
    close(mb.engine[side].funding, mb.totals.funding[side], 6);
    close(mb.engine[side].currentAssets, mb.totals.currentAssets[side], 6);
  }
});
test('Mundo Moda: hoja «Gráficas e interpretación»', () => {
  const ind = C.indicators(mm, mb);
  close(ind.workingCapital.values.previous, 147215, 6); close(ind.workingCapital.values.current, 189825.25, 6);
  close(ind.workingCapital.relative, 0.2894423122643752, 12);
  close(ind.liabilitiesShare.previous, 0.32549413350928025, 12); close(ind.equityShare.current, 0.6978528157559037, 12);
  close((ind.equityShare.current - ind.equityShare.previous) * 100, 2.334694926518399, 10);
  assert.deepEqual(ind.composition.map(g => g.name), ['Activos circulantes', 'Activos no circulantes', 'Otros activos']);
  close(ind.composition[0].share.previous * 100, 36.246019679279385, 10);
  close(ind.composition[1].share.current * 100, 59.1159878891433, 10);
  close(ind.composition[2].share.current * 100, 2.075781279810738, 10);
});
test('Mundo Moda: la interpretación cita las cifras del Excel', () => {
  const text = C.interpret(mm, mb).map(x => `${x.topic}: ${x.text}`).join('\n');
  ['U$ 222,667.25', '25.55 %', 'U$ 871,475.00', 'U$ 1,094,142.25', '34.43 %', 'de 36.25% a 38.81%', 'Banco aumentó 195.41 %', 'Inventario disminuyó 64.65 %', 'Cliente disminuyó 39.96 %',
    'U$ 147,215.00', 'U$ 189,825.25', '28.94 %', 'pasivo de corto plazo aumentó 39.21 %', '30.51 %', '59.12%', 'Equipo de transporte neto aumentó 44.19 %', 'Equipo de oficina neto disminuyó 37.86 %',
    'pasivo total aumentó 16.55 %', 'de 32.55% a 30.21%', 'U$ 19,200.00 (16.70 %)', 'U$ 175,735.25 (29.90 %)', 'de 67.45% a 69.79%', 'Utilidades aumentaron 86.24 %',
    'Franquicias pasan de U$ 60,000.00 a cero', 'surge Otros activos por U$ 22,712.00', 'U$ 37,288.00 (62.15 %)', 'el balance cuadra']
    .forEach(fragment => assert.ok(text.includes(fragment), `falta «${fragment}» en:\n${text}`));
});
test('Mundo Moda: recomendaciones como las del Excel', () => {
  const recs = C.recommend(mm, mb);
  const areas = recs.map(r => r.area);
  ['Pasivos tributarios', 'Reserva de efectivo', 'Equipo de transporte neto', 'Inventario', 'Clientes y cobranza', 'Deuda', 'Equipo de oficina neto', 'Capital y utilidades'].forEach(area => assert.ok(areas.includes(area), `falta el área ${area}: ${areas}`));
  const by = area => recs.find(r => r.area === area);
  assert.equal(by('Pasivos tributarios').priority, 'Alta');
  assert.match(by('Pasivos tributarios').evidence, /IVA x pagar creció 64\.14 % y IR x pagar creció 78\.23 %/);
  assert.match(by('Reserva de efectivo').evidence, /aumentó 195\.41 % y representa 23\.85% del activo en 2019/);
  assert.match(by('Equipo de transporte neto').evidence, /44\.19 % y representa 54\.42% del activo/);
  assert.match(by('Inventario').evidence, /64\.65 % y su peso cayó de 11\.29% a 3\.18%/);
  assert.match(by('Clientes y cobranza').evidence, /39\.96 % y su participación bajó de 10\.03% a 4\.80%/);
  assert.match(by('Deuda').evidence, /16\.70 % y la participación total del pasivo es 30\.21%/);
  assert.match(by('Capital y utilidades').evidence, /69\.79% del financiamiento y utilidades crecieron 86\.24 %/);
  assert.deepEqual([...new Set(recs.map(r => r.priority))], ['Alta', 'Media']);
});
test('Mundo Moda: comprobaciones en OK', () => {
  const ch = C.checks(mm, mb);
  assert.equal(ch.pending, 0, JSON.stringify(ch.items.filter(x => x.ok === false)));
  assert.ok(ch.items.filter(x => x.name === 'Ecuación contable').every(x => x.ok));
  assert.ok(ch.items.length >= 16);
});
test('Comprobaciones: detectan un total del documento que no coincide y una cuenta incompleta', () => {
  const broken = C.samples['mundo-moda']();
  broken.balance[0].amounts.current = 260000; // Banco mal digitado
  broken.balance[2].amounts.previous = null;
  const ch = C.checks(broken);
  assert.ok(ch.items.some(x => x.name === 'Activos circulantes' && x.ok === false && Math.abs(x.difference - 975.2) < 1e-6));
  assert.ok(ch.items.some(x => x.name === 'Ecuación contable' && x.period === '2019' && x.ok === false));
  assert.ok(ch.items.some(x => x.name === 'Cuentas incompletas' && /IVA x cobrar/.test(x.note)));
});

const dy = C.samples.dayton();
const db = C.analyzeBalance(dy), di = C.analyzeIncome(dy);
test('Dayton: el balance cuadra en 2011 y 2012', () => {
  close(db.totals.assets.previous, 143174, 6); close(db.totals.assets.current, 152644, 6);
  assert.deepEqual(db.balanced, { previous: true, current: true });
  close(row(db, 'Propiedad, planta y equipo brutos neto').after, 94940, 6);
});
test('Dayton: estado de resultados cuenta por cuenta', () => {
  close(row(di, 'Utilidad bruta').after, 69208, 6); close(row(di, 'Utilidad bruta').before, 75879, 6);
  close(row(di, 'Total gastos operativos').after, 58031, 6); close(row(di, 'Total gastos operativos').before, 54221, 6);
  close(row(di, 'Utilidad operativa').after, 11177, 6);
  close(row(di, 'Utilidad antes de impuestos').after, 13926, 6); close(row(di, 'Utilidad antes de impuestos').before, 24688, 6);
  close(row(di, 'Utilidad neta').after, 9006.77976, 5); close(row(di, 'Utilidad neta').before, 15431.2344, 4);
  close(row(di, 'Ventas', 'account').verticalAfter, 1, 12);
  close(row(di, 'Costo de bienes vendidos').verticalAfter, 109701 / 178909, 12);
  close(row(di, 'Ventas', 'account').relative, (178909 - 187510) / 187510, 12);
  assert.ok(row(di, 'Impuestos (tasa 37.495% / 35.324%)').computed);
  assert.deepEqual(di.missing, []);
});
test('Dayton: razones del motor por período', () => {
  const r = C.ratios(dy, db, di);
  close(r.current.liquidity.currentRatio.value, 38291 / 33175, 12);
  close(r.current.profitability.metrics.netMargin.value, 9006.77976 / 178909, 9);
  close(r.current.profitability.dupont.roe.value, 9006.77976 / 74597, 9);
  close(r.previous.debt.debtRatio.value, 70013 / 143174, 12);
});
test('Dayton: interpretación y recomendaciones del estado de resultados', () => {
  const text = C.interpret(dy, db, di).map(x => x.text).join('\n');
  ['Las ventas disminuyeron 4.59 %', 'Otros pasivos corrientes aumentaron 330.83 %', 'Los gastos operativos aumentaron 7.03 %', 'Depreciación y amortización aumentó 52.35 %', 'de 8.23% a 5.03%'].forEach(f => assert.ok(text.includes(f), `falta «${f}» en:\n${text}`));
  const areas = C.recommend(dy, db, di).map(r => r.area);
  ['Ventas', 'Rentabilidad', 'Gastos operativos', 'Liquidez inmediata'].forEach(a => assert.ok(areas.includes(a), `falta ${a}: ${areas}`));
});
test('Caso en blanco: estructura completa sin errores', () => {
  const blank = C.blankCase('Prueba');
  const b = C.analyzeBalance(blank), i = C.analyzeIncome(blank);
  assert.equal(b.hasCurrent, false); assert.ok(i.empty);
  assert.deepEqual(C.interpret(blank), []); assert.deepEqual(C.recommend(blank), []);
  assert.deepEqual(C.BLOCKS.map(x => x.group), ['Activos circulantes', 'Activos no circulantes', 'Pasivo de corto plazo', 'Pasivo de largo plazo', 'Capital']);
});

console.log(`\n${passed} pasan, ${failed} fallan`);
process.exitCode = failed ? 1 : 0;
