'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('../assets/js/workbook-import.js'),P=require('../assets/js/paste-import.js'),C=require('../assets/js/casos.js');
const draft=kind=>P.analyze(fs.readFileSync(path.join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8'),{kind,mode:'replace'});
test('Construye ambos estados de forma pura y reemplaza sólo el par revisado',()=>{
 const old=C.blankCase('Mi empresa'),before=structuredClone(old),balance=draft('balance'),income=draft('income');
 const next=W.buildCase(old,balance,income);assert.deepEqual(old,before);assert.equal(next.id,old.id);assert.equal(next.balance.length,11);assert.equal(next.income.length,6);assert.equal(C.analyzeBalance(next).balanced.current,true);assert.equal(C.analyzeIncome(next).statements.current.netProfit,75000);assert.equal(new Set([...next.balance,...next.income].map(r=>r.id)).size,17);
});
test('No combina estados de diferentes períodos, monedas o escalas',()=>{
 const b=draft('balance'),i=draft('income');i.periods.current='2027';assert.throws(()=>W.buildCase(C.blankCase(),b,i),/mismos años/);i.periods.current=b.periods.current;i.units={currency:'USD'};b.units={currency:'C$'};assert.throws(()=>W.buildCase(C.blankCase(),b,i),/monedas/);i.units={scale:'millones'};b.units={scale:'miles'};assert.throws(()=>W.buildCase(C.blankCase(),b,i),/escalas/);
});
test('Una segunda hoja sin clasificación impide construir el documento completo',()=>{
 const b=draft('balance'),i=draft('income');i.rows[0].category=null;i.rows[0].needsReview=true;i.rows[0].confirmed=false;const old=C.blankCase(),before=structuredClone(old);assert.throws(()=>W.buildCase(old,b,i));assert.deepEqual(old,before);
});
test('Un subtítulo de moneda no se usa como nombre de empresa',()=>{
 assert.equal(P.detectCompany('ESTADO DE RESULTADOS\nEjemplo ficticio · Moneda: córdobas nicaragüenses (C$)\nCuenta\t2025\t2026'),null);assert.equal(P.detectCompany('Mundo Moda S.A.\nBalance general'), 'Mundo Moda S.A.');
});
