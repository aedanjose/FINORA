'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const A = require('../assets/js/fixed-assets.js'), I = require('../assets/js/fixed-assets-import.js'), X = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const sample = extra => ({ name: 'Tanque', area: 'Patio', type: 'Instalación', purchaseYear: 2022, cost: 8500, life: 15, residual: 500, replacement: 10000, situation: 'NORMAL', recommendation: 'Inspeccionar fugas', ...extra });
const header = ['Activo', 'Área del hogar', 'Tipo', 'Año compra', 'Costo (C$)', 'Vida útil (años)', 'Residual (C$)', 'Edad 2026', 'Deprec. anual (C$)', 'Deprec. acumulada (C$)', 'Valor contable (C$)', 'Reposición (C$)', 'Situación / acción', 'Recomendación'];
const excelRow = ['Tanque', 'Patio', 'Instalación', 2022, 8500, 15, 500, 4, 533.3333333333333, 2133.333333333333, 6366.666666666667, 10000, 'NORMAL', 'Inspeccionar fugas'];
function workbook(rows = [header, excelRow]) {
  const w = X.utils.book_new(); X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['ACTIVOS DEL HOGAR'], [], ...rows]), 'ACTIVOS');
  X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['LECTURA'], ['Nombre', 'Valor contable'], ['Tanque', 6366.6666667]]), 'LECTURA DEL INVENTARIO');
  X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['CONCEPTO', 'DATO'], ['Costo', 8500]]), 'Concepto'); return w;
}
const parse = w => I.read(X.write(w, { type: 'buffer', bookType: 'xlsx' }), 'activos.xlsx', X);
const preview = r => I.preview(r, A.blank(2026), { mode: 'merge', year: r.year });
function fixture() {
  const data = new Map([['finora:personal-budget:v1', 'personal intacto'], ['finora:casos:v1', 'empresas intactas']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; return { data, storage, store: A.createStore(storage) };
}
test('Depreciación lineal usa la proporción exacta antes de redondear, y conserva el residual', () => {
  const r = A.calculate(sample(), 2026); assert.equal(r.age, 4); assert.equal(r.annual, 533.33); assert.equal(r.accumulated, 2133.33); assert.equal(r.book, 6366.67);
  const end = A.calculate(sample(), 2099); assert.equal(end.accumulated, 8000); assert.equal(end.book, 500); assert.equal(end.exhausted, true); assert.equal(end.remainingYears, 0);
  assert.equal(A.calculate(sample(), 2022).accumulated, 0);
});
test('Validación: importes, años, vida útil, compras futuras y residual mayor al costo', () => {
  for (const change of [{ cost: '' }, { cost: -1 }, { cost: Infinity }, { residual: '' }, { life: 0 }, { life: 2.5 }, { purchaseYear: '202x' }, { cost: '2.555' }, { name: '' }, { area: '' }, { type: '' }, { residual: 9000 }]) assert.throws(() => A.calculate(sample(change), 2026));
  assert.throws(() => A.calculate(sample(), 2021), /posterior/); assert.throws(() => A.calculate(sample(), ''), /valoración/);
  assert.equal(A.calculate(sample({ cost: 0, residual: 0, replacement: 0 }), 2026).book, 0);
  assert.equal(A.calculate(sample({ cost: 500, residual: 500 }), 2026).annual, 0);
});
test('Centavos, límites y redondeo no acumulan errores de cuotas anuales', () => {
  const r = A.calculate(sample({ cost: 100, residual: 0, life: 3, purchaseYear: 2024 }), 2026);
  assert.equal(r.annual, 33.33); assert.equal(r.accumulated, 66.67); assert.equal(r.book, 33.33);
  const huge = A.calculate(sample({ cost: A.MAX, residual: 0, life: 999, purchaseYear: 1 }), 9999); assert.equal(huge.book, 0); assert.equal(huge.accumulated, A.MAX);
  let s = A.upsert(A.blank(2026), sample({ cost: A.MAX, residual: 0 })); assert.throws(() => A.upsert(s, sample()), /límite/);
});
test('Registro, edición, eliminación y cambio de año conservan IDs y recalculan los gráficos', () => {
  const original = A.blank(2026); let s = A.upsert(original, sample()); const id = s.assets[0].id;
  assert.equal(original.assets.length, 0); s = A.upsert(s, { ...s.assets[0], cost: 10000 }); assert.equal(s.assets.length, 1); assert.equal(s.assets[0].id, id);
  assert.equal(A.summary(s).types[0].cost, 10000); s = A.setYear(s, 2027); assert.equal(A.summary(s).rows[0].age, 5);
  s = A.remove(s, id); assert.equal(A.summary(s).count, 0); assert.equal(A.summary(s).cost, 0);
});
test('Reposición desconocida no se confunde con cero ni con gasto', () => {
  let s = A.upsert(A.blank(2026), sample({ replacement: null })); let r = A.summary(s); assert.equal(r.replacement, null); assert.equal(r.missingReplacement, 1);
  s = A.upsert(s, sample({ name: 'Otro', replacement: 0 })); r = A.summary(s); assert.equal(r.replacement, 0); assert.equal(r.missingReplacement, 1); assert.equal(r.cost, 17000);
});
test('Reconoce encabezados, 3 hojas, clasificación y totales sin duplicar lecturas', () => {
  const r = parse(workbook([header, excelRow, ['TOTALES', null, null, null, 8500, null, null, null, null, 2133.333333, 6366.666667, 10000]])), p = preview(r);
  assert.equal(r.year, 2026); assert.equal(r.sheets.length, 3); assert.equal(r.entries.length, 1); assert.equal(p.totals.book, 6366.67); assert.equal(p.totals.rows[0].area, 'Patio');
  assert.ok(r.warnings.some(w => w.includes('totales'))); assert.ok(!p.warnings.some(w => w.includes('calculado')));
});
test('Columnas reordenadas y encabezados desplazados se detectan sin celdas fijas', () => {
  const r = parse(workbook([['Título adicional'], [], [...header].reverse(), [...excelRow].reverse()])); assert.equal(preview(r).added, 1); assert.equal(preview(r).totals.cost, 8500);
});
test('Datos incompletos se corrigen o excluyen explícitamente; un año ausente debe indicarse', () => {
  const bad = [...excelRow]; bad[5] = '';
  const r = parse(workbook([header, excelRow, bad])); assert.match(r.entries[1].issue, /Vida útil/); assert.throws(() => preview(r), /fila/i);
  r.entries[1].excluded = true; assert.equal(preview(r).added, 1);
  const noYear = [...header]; noYear[7] = 'Edad'; const missing = parse(workbook([noYear, excelRow])); assert.equal(missing.year, null); assert.throws(() => preview(missing), /valoración/);
  assert.equal(I.preview(missing, A.blank(2026), { year: 2026, mode: 'merge' }).totals.book, 6366.67);
});
test('Fórmulas de Excel en columnas calculadas no reemplazan al motor; faltantes de entrada bloquean', () => {
  const w = workbook(); w.Sheets.ACTIVOS.J4 = { t: 'n', v: 1, f: '1' }; let r = parse(w); assert.ok(r.warnings.some(w => w.includes('difiere'))); assert.equal(preview(r).totals.accumulated, 2133.33);
  w.Sheets.ACTIVOS.E4 = { t: 'n', f: 'SUM(A1:A2)' }; r = parse(w); assert.ok(r.entries[0].issue); assert.throws(() => preview(r));
});
test('Reimportación no duplica ni restaura activos editados o eliminados', () => {
  const incoming = { year: 2026, assets: [sample(), sample({ name: 'Otro' })] }; let r = A.prepareImport(A.blank(2026), incoming); const ids = r.state.assets.map(a => a.id);
  const again = A.prepareImport(r.state, incoming); assert.equal(again.added, 0); assert.deepEqual(again.state.assets.map(a => a.id), ids);
  let s = A.upsert(r.state, { ...r.state.assets[0], cost: 9000 }); s = A.remove(s, ids[1]); r = A.prepareImport(s, incoming);
  assert.equal(r.added, 0); assert.equal(r.skipped, 2); assert.equal(r.state.assets[0].cost, 9000); assert.equal(r.state.assets.length, 1);
});
test('Filas idénticas conservan multiplicidad y se advierten; reemplazar requiere opción explícita', () => {
  const report = parse(workbook([header, excelRow, excelRow])); assert.ok(report.warnings.some(w => w.includes('idénticas'))); let p = preview(report); assert.equal(p.added, 2);
  assert.equal(A.prepareImport(p.state, p.incoming).added, 0);
  p = A.prepareImport(p.state, { year: 2026, assets: [sample({ name: 'Nuevo' })] }, { mode: 'replace' }); assert.equal(p.replaced, 2); assert.equal(p.state.assets.length, 1);
});
test('Guardado y recuperación mantienen datos, IDs y aislamiento entre módulos', () => {
  const { store, storage, data } = fixture(); store.setYear(2026); const s = store.importData({ year: 2026, assets: [sample()] }).state;
  assert.deepEqual(A.createStore(storage).load(), s); assert.equal(data.get('finora:personal-budget:v1'), 'personal intacto'); assert.equal(data.get('finora:casos:v1'), 'empresas intactas');
  const before = data.get(A.KEY); storage.setItem = () => { throw Error('quota'); }; assert.throws(() => store.saveAsset(sample()), /No se pudo guardar/); assert.equal(data.get(A.KEY), before);
});
test('Datos corruptos y versión incompatible no se sobrescriben', () => {
  const { store, data } = fixture();
  for (const raw of ['{bad', JSON.stringify({ ...A.blank(2026), version: 9 })]) { data.set(A.KEY, raw); assert.throws(() => store.saveAsset(sample()), /No se sobrescribieron/); assert.equal(data.get(A.KEY), raw); }
});
test('Lectura inválida, formatos incompatibles y archivos vacíos fallan sin guardar', () => {
  assert.throws(() => I.read(Buffer.alloc(0), 'x.xlsx', X), /vacío/); assert.throws(() => I.read(Buffer.from('bad'), 'x.xlsx', X), /válido/); assert.throws(() => I.read(Buffer.from('x'), 'x.csv', X), /xlsx/);
  assert.throws(() => parse(workbook([['Sin estructura']])), /No se encontró/);
});
test('Excel real: 10 activos, C$122900 costo, C$66448.33 depreciación, C$56451.67 neto, original intacto', { skip: !process.env.FINORA_ASSETS_XLSX }, () => {
  const file = process.env.FINORA_ASSETS_XLSX, bytes = fs.readFileSync(file), hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const report = I.read(bytes, 'activos.xlsx', X), p = preview(report);
  assert.equal(p.added, 10); assert.equal(report.year, 2026); assert.equal(p.totals.cost, 122900); assert.equal(p.totals.accumulated, 66448.33); assert.equal(p.totals.book, 56451.67); assert.equal(p.totals.replacement, 153000); assert.equal(p.totals.exhausted, 1);
  assert.equal(p.totals.rows.find(a => a.name === 'Bomba de agua').book, 500); assert.equal(p.totals.rows.find(a => a.name === 'Cocina de gas').situation, 'SEGUIMIENTO');
  assert.equal(A.prepareImport(p.state, p.incoming).added, 0); assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash);
});
