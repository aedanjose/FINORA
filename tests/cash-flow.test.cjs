'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../assets/js/casos.js'),P=require('../assets/js/paste-import.js'),B=require('../assets/js/workbook-import.js'),W=require('../assets/js/cash-flow.js');
function fixture(){const draft=kind=>P.analyze(fs.readFileSync(path.join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8'),{kind});return B.buildCase(C.blankCase('Prueba financiera'),draft('balance'),draft('income'));}
const settings=c=>({periodKey:W.periodKey(c),reviewedSignature:W.signature(c)});
test('El Excel de prueba produce 65000 de operación, -40000 de inversión y -10000 de financiamiento',()=>{
 const c=fixture(),before=structuredClone(c),a=W.analyze(c);assert.deepEqual(a.sums,{operating:65000,investing:-40000,financing:-10000,exchange:0});assert.equal(a.opening,85000);assert.equal(a.closing,100000);assert.equal(a.net,15000);assert.equal(a.calculatedClosing,100000);assert.equal(a.difference,0);assert.equal(a.status,'estimated');assert.deepEqual(c,before);assert.equal(W.analyze(c,settings(c)).status,'reconciled');
});
test('Préstamos de corto plazo son financiamiento y los proveedores operación',()=>{
 const a=W.analyze(fixture());assert.equal(a.rows.find(r=>r.label==='Préstamos de corto plazo').activity,'financing');assert.equal(a.rows.find(r=>r.label==='Cuentas por pagar / proveedores').activity,'operating');assert.equal(a.rows.find(r=>r.label==='Préstamos de corto plazo').amount,-5000);assert.equal(a.rows.find(r=>r.label==='Cuentas por pagar / proveedores').amount,10000);
});
test('No añade pagos artificiales para cerrar una diferencia',()=>{
 const c=fixture(),a=W.analyze(c,{...settings(c),investingOverride:-42000});assert.equal(a.net,13000);assert.equal(a.calculatedClosing,98000);assert.equal(a.closing,100000);assert.equal(a.difference,2000);assert.equal(a.status,'difference');assert.equal(a.rows.filter(r=>r.activity==='investing').length,1);assert.equal(a.rows.some(r=>/cuadre|diferencia/i.test(r.label)),false);
});
test('Vacío y cero se distinguen; sin dos saldos de efectivo no hay conciliación',()=>{
 const c=fixture();c.balance[0].amounts.previous=null;let a=W.analyze(c);assert.equal(a.opening,null);assert.equal(a.status,'incomplete');assert.equal(a.difference,null);c.balance[0].amounts.previous=0;a=W.analyze(c);assert.equal(a.opening,0);assert.equal(a.issues.some(i=>i.code==='cash'),false);
});
test('Una cuenta de deuda genérica requiere actividad; no se clasifica como préstamo por ser no corriente',()=>{
 const c=fixture(),loan=c.balance.find(a=>/largo plazo/.test(a.name));loan.name='Otros pasivos no corrientes';loan.role=null;let a=W.analyze(c);assert.equal(a.status,'incomplete');assert.ok(a.issues.some(i=>i.code==='classification'));a=W.analyze(c,{allocations:{[loan.id]:'financing'}});assert.equal(a.complete,true);assert.equal(a.sums.financing,-10000);
});
test('La depreciación proviene del gasto y no del cambio de la contracuenta',()=>{
 const c=fixture();c.balance.find(a=>a.sign===-1).amounts.current=49000;assert.equal(W.analyze(c).depreciation,15000);assert.equal(W.analyze(c,{depreciation:12000}).depreciation,12000);
});
test('Activo fijo neto sin contracuenta también incorpora la depreciación a la inversión estimada',()=>{
 const c=fixture(),fixed=c.balance.find(a=>a.role==='fixed'&&a.sign===1);fixed.name='Activo fijo neto';fixed.amounts={previous:220000,current:245000};c.balance=c.balance.filter(a=>a.sign!==-1);const a=W.analyze(c);assert.equal(a.sums.investing,-40000);assert.equal(a.difference,0);
});
test('Sin gasto identificado la depreciación se solicita y cero explícito se acepta',()=>{
 const c=fixture();c.income=c.income.filter(a=>!/depreci/i.test(a.name));let a=W.analyze(c);assert.equal(a.depreciation,null);assert.equal(a.status,'incomplete');assert.equal(a.net,null);a=W.analyze(c,{depreciation:0});assert.equal(a.depreciation,0);assert.equal(a.issues.some(i=>i.code==='depreciation'),false);
});
test('Cambiar las cuentas revoca la revisión de supuestos y cambiar años no reutiliza los ajustes',()=>{
 const c=fixture();c.params.cashFlow={...settings(c),depreciation:1234,adjustments:[{id:'x',label:'Diferencia de cambio',activity:'exchange',amount:10}]};assert.equal(W.analyze(c).confirmed,true);c.income[0].amounts.current+=100;assert.equal(W.analyze(c).confirmed,false);c.periods.current='2027';const a=W.analyze(c);assert.equal(a.staleSettings,true);assert.equal(a.settings.depreciation,undefined);assert.equal(a.sums.exchange,0);
});
test('Ajustes, moneda y escala conservan los importes y sólo afectan al flujo',()=>{
 const c=fixture(),before=structuredClone(c);c.scale='miles';const a=W.analyze(c,{adjustments:[{id:'x',label:'Efecto cambiario',activity:'exchange',amount:300}]});assert.equal(a.sums.exchange,300);assert.equal(a.net,15300);assert.equal(a.difference,-300);assert.deepEqual(c.balance,before.balance);assert.deepEqual(c.income,before.income);
});
test('Importes inválidos, depreciación negativa y ajustes incompletos no son un flujo completo',()=>{
 const c=fixture();for(const s of [{depreciation:-1},{investingOverride:'ilegible'},{adjustments:[{activity:'operating',amount:1}]}]) assert.equal(W.analyze(c,s).status,'incomplete');
});
test('Los casos de clase y los documentos vacíos no causan errores ni utilidades inventadas',()=>{
 const moda=W.analyze(C.samples['mundo-moda']());assert.equal(moda.profit,null);assert.equal(moda.status,'incomplete');const empty=W.analyze(C.blankCase());assert.equal(empty.opening,null);assert.equal(empty.net,null);assert.equal(empty.status,'incomplete');assert.doesNotThrow(()=>W.analyze(C.samples.dayton()));
});
module.exports={fixture};
