'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../assets/js/paste-import.js'),C=require('../assets/js/casos.js');
const fixture=kind=>fs.readFileSync(path.join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8');
const options={kind:'balance',periods:{previous:'2025',current:'2026'}};
test('Excel 2025-2026: Patrimonio es encabezado, sus tres cuentas son capital y la diferencia es un control',()=>{
 const d=P.analyze(fixture('balance'),options),v=P.validate(d,C.blankCase());
 assert.equal(d.rows.length,11);assert.equal(d.rows.some(r=>/^(PATRIMONIO|DIFERENCIA)/.test(r.name)),false);
 assert.equal(d.rows.filter(r=>r.section==='equity').length,3);assert.equal(d.rows.filter(r=>r.section==='liability').length,3);
 assert.equal(d.rows.filter(r=>r.needsReview).length,0);assert.equal(v.valid,true);assert.equal(v.totals.length,9);assert.ok(v.totals.every(t=>t.status==='ok'));
 assert.equal(d.rows.find(r=>r.name==='Depreciación acumulada').sign,-1);assert.deepEqual(d.rows.find(r=>r.name==='Depreciación acumulada').amounts,{previous:40000,current:55000});
});
test('Las dos hojas del Excel dan balances cuadrados y utilidades coherentes sin confirmaciones innecesarias',()=>{
 let c=C.blankCase();for(const kind of ['balance','income']){const d=P.analyze(fixture(kind),{...options,kind});assert.equal(P.validate(d,c).valid,true);c=P.buildCase(c,d);}
 const b=C.analyzeBalance(c),i=C.analyzeIncome(c);
 assert.equal(b.balanced.previous,true);assert.equal(b.balanced.current,true);assert.equal(b.totals.assets.previous,460000);assert.equal(b.totals.assets.current,535000);
 assert.equal(b.totals.liabilities.current,260000);assert.equal(b.totals.equity.current,275000);assert.equal(i.statements.previous.netProfit,60000);assert.equal(i.statements.current.netProfit,75000);
 assert.equal(C.checks(c).items.filter(x=>x.ok===false).length,0);
});
test('El conflicto de períodos continúa bloqueando mezclar 2025-2026 con datos de otro año',()=>{
 const original=C.samples.dayton(),copy=JSON.stringify(original),d=P.analyze(fixture('balance'),options);
 assert.ok(P.validate(d,original).errors.some(e=>e.code==='period-conflict'));assert.throws(()=>P.buildCase(original,d),/años no coinciden/);assert.equal(JSON.stringify(original),copy);
 const fresh=C.blankCase('Documento nuevo');fresh.periods={...d.periods};const next=P.buildCase(fresh,d);assert.notEqual(next.id,original.id);assert.deepEqual(next.periods,{previous:'2025',current:'2026'});
});
test('Una fila de diagnóstico no se confunde con cuentas reales llamadas Diferencia de cambio',()=>{
 const d=P.analyze('Cuenta\t2025\t2026\nPatrimonio\t\t\nCapital social\t100\t110\nDiferencia de cambio\t5\t6\nTOTAL PATRIMONIO\t105\t116\nDIFERENCIA (debe ser cero)\t0\t0',options);
 assert.equal(d.rows.length,2);assert.ok(d.rows.some(r=>r.name==='Diferencia de cambio'));
 assert.equal(d.rows[0].section,'equity');assert.equal(d.totals.some(t=>t.part==='difference'),true);
});
test('Un encabezado con celdas vacías no consume una cuenta de detalle conocida y también vacía',()=>{
 const d=P.analyze('Cuenta\t2025\t2026\nPatrimonio\t\t\nCapital social\t\t\nUtilidades retenidas\t1\t2',options);
 assert.equal(d.rows.length,2);assert.equal(d.rows[0].name,'Capital social');assert.deepEqual(d.rows[0].amounts,{previous:null,current:null});assert.equal(d.rows[1].section,'equity');
});
