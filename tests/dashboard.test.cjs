'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../assets/js/casos.js'),P=require('../assets/js/paste-import.js'),B=require('../assets/js/workbook-import.js'),D=require('../assets/js/dashboard.js');
function fixture(){const draft=kind=>P.analyze(fs.readFileSync(path.join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8'),{kind});return B.buildCase(C.blankCase('Prueba del resumen'),draft('balance'),draft('income'));}
test('Resumen conectado muestra utilidad, liquidez, deuda y cambios de los estados',()=>{
 const c=fixture(),before=structuredClone(c),a=D.analyze(c);assert.equal(a.state,'positive');assert.equal(a.sales.current,700000);assert.equal(a.profit.current,75000);assert.equal(a.cash.current,100000);assert.equal(a.currentRatio.current,290000/115000);assert.equal(a.debtRatio.current,260000/535000);assert.equal(a.margin.current,75000/700000);assert.equal(a.changes.profit.relative,.25);assert.deepEqual(c,before);
});
test('Escenario inicial explícito de 8 % conserva exactamente el margen actual',()=>{
 const p=D.project(fixture());assert.equal(p.sales,756000);assert.ok(Math.abs(p.profit-81000)<.00001);assert.equal(p.growth,8);assert.equal(p.explicitMargin,false);assert.equal(p.label,'2027');
});
test('Margen y crecimiento editables cambian la meta sin cambiar los estados',()=>{
 const c=fixture(),before=structuredClone(c),p=D.project(c,{growth:20,marginPercent:12});assert.equal(p.sales,840000);assert.equal(p.profit,100800);assert.equal(p.explicitMargin,true);assert.deepEqual(c,before);
});
test('Los supuestos se guardan por empresa y períodos y caducan al cambiar los años',()=>{
 const c=fixture();c.params.dashboard={periodKey:D.periodKey(c),growth:15,marginPercent:9};assert.ok(Math.abs(D.analyze(c).projection.sales-805000)<.00001);c.periods.current='2027';assert.equal(D.settingsFor(c).growth,8);assert.equal(D.analyze(c).projection.label,'2028');assert.equal(D.settingsFor(fixture()).growth,8);
});
test('Pérdidas y margen negativo no aparecen como un resultado positivo',()=>{
 const c=fixture();c.reported={};c.income.find(a=>a.category==='costSales').amounts.current=800000;const a=D.analyze(c);assert.equal(a.state,'negative');assert.ok(a.profit.current<0);assert.ok(a.projection.profit<0);assert.ok(Math.abs(D.project(c,{growth:10,marginPercent:-5}).profit+38500)<.00001);
});
test('Faltantes y cero en el período anterior no generan porcentajes inventados',()=>{
 const c=fixture();c.income.find(a=>a.category==='sales').amounts.previous=0;c.reported={};let a=D.analyze(c);assert.equal(a.changes.sales.relative,null);c.balance.find(a=>a.role==='cash').role=null;a=D.analyze(c);assert.equal(a.cash.current,null);assert.equal(a.cash.previous,null);const empty=D.analyze(C.blankCase());assert.equal(empty.profit.current,null);assert.equal(empty.projection.sales,null);assert.notEqual(empty.state,'positive');
});
test('El balance descuadrado activa revisión aunque exista utilidad',()=>{
 const c=fixture();c.balance[0].amounts.current+=1;const a=D.analyze(c);assert.equal(a.profit.current,75000);assert.equal(a.state,'review');assert.ok(a.checks.pending>0);
});
test('Los escenarios validan rangos y permiten crecimiento -100 % sin ventas negativas',()=>{
 const c=fixture();assert.equal(D.project(c,{growth:-100,marginPercent:10}).sales,0);for(const s of [{growth:NaN},{growth:201},{growth:-101},{growth:0,marginPercent:101},{growth:0,marginPercent:'10'}]) assert.throws(()=>D.project(c,s));c.periods.current='Actual';assert.equal(D.project(c).label,'Próximo período');
});
