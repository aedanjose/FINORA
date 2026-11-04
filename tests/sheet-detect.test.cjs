'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/js/sheet-detect.js');
const T = require('../assets/js/file-table.js');
const P = require('../assets/js/paste-import.js');
const W = require('../assets/js/workbook-import.js');
const C = require('../assets/js/casos.js');
const L = require('./fixtures/libro-practica.cjs');

const sheets = list => list.map(([name, rows]) => ({ name, data: { name, rows: rows.map(r => [...r]), problems: [] } }));
const confirmAll = draft => { draft.rows.forEach(r => { r.confirmed = true; }); return draft; };
const control = (model) => {
  const b = C.analyzeBalance(model), i = C.analyzeIncome(model);
  assert.equal(b.totals.assets.previous, 138000); assert.equal(b.totals.assets.current, 173000);
  assert.equal(b.totals.liabilities.previous, 60000); assert.equal(b.totals.liabilities.current, 65000);
  assert.equal(b.totals.equity.previous, 78000); assert.equal(b.totals.equity.current, 108000);
  assert.deepEqual(b.difference, { previous: 0, current: 0 });
  assert.equal(i.statements.previous.netProfit, 30000); assert.equal(i.statements.current.netProfit, 30000);
};

test('Libro de 8 hojas: detecta Balance y Resultados e ignora las auxiliares con su motivo', () => {
  const r = D.detectWorkbook(sheets(L.hojas));
  assert.equal(r.choice.balance, 'Balance');
  assert.equal(r.choice.income, 'Resultados');
  const ignored = Object.fromEntries(r.ignored.map(x => [x.name, x.reason]));
  ['Guia practica', 'Presupuesto 2026', 'Complementarios', 'Cuentas para clasificar', 'Clave contable'].forEach(name => assert.ok(ignored[name], `${name} debió ignorarse`));
  assert.match(ignored['Guia practica'], /ninguna fila con importes/);
  assert.match(ignored['Presupuesto 2026'], /dos años/);
  // «Balance detallado» también es un balance válido: se ofrece como alternativa.
  assert.deepEqual(r.candidates.balance.map(c => c.name).sort(), ['Balance', 'Balance detallado']);
  assert.equal(r.ambiguous.balance, true);
  assert.deepEqual(r.notes, []);
});

test('Datos de control: el libro detectado cuadra y la utilidad neta es 30,000 en ambos años', () => {
  const r = D.detectWorkbook(sheets(L.hojas));
  const b = D.pick(r, 'balance', r.choice.balance), i = D.pick(r, 'income', r.choice.income);
  assert.deepEqual(b.years, { previous: 2024, current: 2025 });
  assert.equal(b.config.last + 1, L.balance.length - 2, 'la nota final no entra en el rango');
  assert.equal(b.coherent, true); assert.equal(i.coherent, true);
  assert.equal(b.warnings.filter(w => w.level === 'error').length, 0);
  const model = W.buildCase(C.blankCase('Comercial Prueba'), confirmAll(b.draft), confirmAll(i.draft));
  control(model);
  assert.deepEqual(model.periods, { previous: '2024', current: '2025' });
});

test('Ruta real de Excel: .xlsx generado, leído con SheetJS y detectado', () => {
  const XLSX = require('../assets/vendor/sheetjs/xlsx.full.min.js');
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of L.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const book = T.read(bytes, 'finora practica.xlsx', XLSX);
  const list = T.sheets(book).map(s => ({ name: s.name, data: T.sheetData(book, s.name, XLSX) }));
  assert.equal(list.length, 8);
  const r = D.detectWorkbook(list);
  assert.equal(r.choice.balance, 'Balance'); assert.equal(r.choice.income, 'Resultados');
  const model = W.buildCase(C.blankCase('x'), confirmAll(D.pick(r, 'balance').draft), confirmAll(D.pick(r, 'income').draft));
  control(model);
});

test('Excel con solo dos hojas financieras', () => {
  const r = D.detectWorkbook(sheets([['Hoja1', L.balance], ['Hoja2', L.resultados]]));
  assert.equal(r.choice.balance, 'Hoja1'); assert.equal(r.choice.income, 'Hoja2');
  assert.equal(r.ambiguous.balance, false); assert.equal(r.ignored.length, 0);
});

test('Columnas en otro orden: años invertidos y la cuenta al final', () => {
  const rows = L.balance.map(row => row.length === 3 ? [row[2], row[1], row[0]] : row.length === 1 ? [null, null, row[0]] : row);
  const s = D.analyzeSheet({ rows }, 'Invertido');
  assert.equal(s.ignored, false, s.reason);
  assert.deepEqual(s.years, { previous: 2024, current: 2025 });
  assert.equal(s.config.account, 2); assert.equal(s.config.previous, 1); assert.equal(s.config.current, 0);
  assert.equal(s.coherent, true);
});

test('Años en distintos formatos reconocibles en el encabezado', () => {
  for (const [a, b] of [['Dic. 2024', '31/12/2025'], ['Año 2024', 'Año 2025'], ['2024-12-31', '2025-12-31']]) {
    const rows = L.resultados.map(row => row[0] === 'Concepto' ? ['Descripción de la partida', a, b] : row);
    const s = D.analyzeSheet({ rows }, 'Resultados');
    assert.equal(s.ignored, false, `${a}/${b}: ${s.reason}`);
    assert.deepEqual(s.years, { previous: 2024, current: 2025 });
  }
});

test('Encabezados y subtotales intermedios no se cuentan dos veces', () => {
  const s = D.analyzeSheet({ rows: L.balanceDetallado }, 'Balance detallado');
  assert.equal(s.coherent, true);
  assert.ok(s.totals >= 8, 'los totales del documento quedan como comprobaciones');
  assert.ok(!s.draft.rows.some(r => /^total/i.test(r.name)), 'ningún total se volvió cuenta');
});

test('Cuentas desconocidas o ambiguas quedan pendientes de confirmar', () => {
  const rows = L.balance.map(r => r[0] === 'Cuentas por pagar' ? ['Anticipos de clientes', 20000, 22000] : r);
  const s = D.analyzeSheet({ rows }, 'Balance');
  assert.ok(s.pending >= 1);
  assert.ok(s.warnings.some(w => w.level === 'review' && /Anticipos de clientes/.test(w.text)));
});

test('Cuentas duplicadas, balance descuadrado y datos incompletos se avisan', () => {
  const dup = L.balance.map(r => r[0] === 'Cuentas por cobrar' ? ['Inventarios', 25000, 30000] : r);
  assert.ok(D.analyzeSheet({ rows: dup }, 'Balance').warnings.some(w => /Cuenta repetida: «Inventarios»/.test(w.text)));
  const off = L.balance.map(r => r[0] === 'Efectivo y equivalentes' ? [r[0], 30000, 46000] : r);
  const s = D.analyzeSheet({ rows: off }, 'Balance');
  assert.ok(s.warnings.some(w => w.level === 'error' && /2025: el balance no cuadra/.test(w.text)), JSON.stringify(s.warnings));
  const gap = L.balance.map(r => r[0] === 'Inventarios' ? [r[0], null, 28000] : r);
  assert.ok(D.analyzeSheet({ rows: gap }, 'Balance').warnings.some(w => /período sin importe: Inventarios/.test(w.text)));
});

test('Corrección manual de una clasificación antes de guardar', () => {
  const rows = L.balance.map(r => r[0] === 'Cuentas por pagar' ? ['Anticipos de clientes', 20000, 22000] : r);
  const draft = D.analyzeSheet({ rows }, 'Balance').draft;
  assert.equal(P.validate(draft).valid, false);
  const row = draft.rows.find(r => r.name === 'Anticipos de clientes');
  Object.assign(row, { section: 'liability', term: 'current', group: 'Pasivo de corto plazo', role: null, confirmed: true });
  confirmAll(draft);
  assert.equal(P.validate(draft).valid, true);
  const model = P.buildCase(C.blankCase('x'), draft);
  assert.equal(model.balance.find(a => a.name === 'Anticipos de clientes').section, 'liability');
});

test('La detección no modifica el libro ni guarda nada (cancelar es seguro)', () => {
  const input = sheets(L.hojas), before = JSON.stringify(input);
  D.detectWorkbook(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(typeof globalThis.localStorage, 'undefined');
});
