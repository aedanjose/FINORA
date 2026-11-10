'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../assets/js/casos.js'), B = require('../assets/js/budget.js');
const E = require('../assets/js/break-even.js'), L = require('../assets/js/leverage.js');
const near = (a,b) => assert.ok(Number.isFinite(a) && Math.abs(a-b) < 1e-7, String(a) + ' != ' + b);
function fixture(count=1) {
  let c = C.blankCase('Proyección de control');
  c.currency='C$'; c.scale='en miles';
  const s=B.newProjection(c); s.name='Octubre'; s.config={frequency:'monthly',start:'2026-10-01',count};
  Object.assign(s.products[0],{initialUnits:0,initialValue:0,inventoryMode:'manual'});
  s.expenses=[{id:'fixed',label:'Gastos fijos',category:'administration',mode:'manual',values:{}}];
  s.result.interestMode='manual';s.result.taxMode='none';
  for(const p of B.periodList(s.config)){
    s.products[0].values[p.key]={units:300,price:1000,unitCost:600,targetUnits:0};
    s.expenses[0].values[p.key]=70000;s.result.interest[p.key]=10000;
  }
  c=B.saveProjection(c,s);return {c,s:c.params.budget};
}
test('El adaptador real coincide con Proforma y no modifica la empresa ni el presupuesto',()=>{
  const {c}=fixture(),before=JSON.stringify(c),r=B.analyze(c),a=L.analyze(c);
  assert.equal(a.unavailable,false,a.reason);near(a.sales,300000);near(a.cm,120000);
  near(a.ebit,r.totals.ebit);near(a.ebt,r.totals.ebt);
  near(a.gao,2.4);near(a.gaf,1.25);near(a.gat,3);
  const high=L.scenario(a,10),low=L.scenario(a,-10),base=L.scenario(a,0);
  near(high.ebit,62000);near(high.ebt,52000);near(high.changes.ebit.relative,.24);
  near(low.ebit,38000);near(low.ebt,28000);near(base.ebt,40000);
  assert.equal(JSON.stringify(c),before);
});
test('Otros ingresos y gastos se conservan incluso en el escenario Base',()=>{
  const {c,s}=fixture();Object.assign(s.result,{otherEnabled:true,otherIncome:{'2026-10':15000},otherExpenses:{'2026-10':5000}});
  const a=L.analyze(c),r=B.analyze(c);
  near(a.ebt,50000);near(a.gaf,1);near(a.gat,2.4);
  near(L.scenario(a,0).ebt,r.totals.ebt);near(L.scenario(a,10).ebt,62000);
  s.result.otherExpenses['2026-10']=30000;
  const lossOther=L.analyze(c);near(lossOther.ebt,25000);near(L.scenario(lossOther,0).ebt,25000);
});
test('No se sustituyen ceros, pérdidas ni contribuciones negativas por cifras de ejemplo',()=>{
  const {c,s}=fixture();s.expenses[0].values['2026-10']=120000;
  let a=L.analyze(c);assert.equal(a.gao,null);near(a.gaf,0);assert.equal(a.gat,null);
  assert.equal(L.scenario(a,10).changes.ebit.relative,null);
  s.expenses[0].values['2026-10']=110000;
  a=L.analyze(c);near(a.ebt,0);assert.equal(a.gaf,null);
  s.expenses[0].values['2026-10']=150000;
  a=L.analyze(c);near(a.gao,-4);near(a.gaf,.75);near(a.gat,-3);
  assert.equal(L.scenario(a,10).changes.ebit.relative,null);
  near(L.scenario(a,10).changes.ebit.absolute,12000);
  s.products[0].values['2026-10'].unitCost=1100;
  a=L.analyze(c);near(a.cm,-30000);assert.equal(a.unavailable,false);
  s.products[0].values['2026-10'].units=0;
  a=L.analyze(c);near(a.sales,0);near(a.gao,0);assert.equal(a.variableRatio,null);
  assert.equal(L.scenario(a,10).changes.sales.relative,null);
});
test('Datos incompletos, caja independiente y contexto cambiado quedan pendientes',()=>{
  const {c,s}=fixture();s.result.interest['2026-10']=null;
  assert.equal(L.analyze(c).unavailable,true);
  s.result.interest['2026-10']=10000;s.result.taxMode='pending';
  assert.equal(L.analyze(c).unavailable,true);
  s.result.taxMode='none';s.mode='cash';
  assert.match(L.analyze(c).reason,/caja independiente/);
  s.mode='integrated';c.currency='USD';
  assert.equal(L.analyze(c).unavailable,true);
  c.currency='C$';c.scale='unidades';assert.equal(L.analyze(c).unavailable,true);
  assert.equal(L.analyze(C.blankCase('Vacío'),'historical').unavailable,true);
  assert.equal(L.scenario(L.analyze(C.blankCase('Vacío')),10),null);
});
test('Histórico respeta la clasificación de Punto de equilibrio y los otros resultados',()=>{
  const c=C.samples.dayton(),e=E.analyze(c),a=L.analyze(c,'historical');
  assert.equal(a.unavailable,false,a.reason);near(a.cm,e.contribution);near(a.fc,e.fixedCosts);near(a.gao,e.gao.value);
  near(L.scenario(a,0).ebt,C.analyzeIncome(c).statements.current.ebt);
  const expense=c.income.find(x=>x.category==='opex');expense.behavior='variable';
  near(L.analyze(c,'historical').cm,E.analyze(c).contribution);
});
test('Moneda y escala se heredan sin multiplicar importes ni alterar razones',()=>{
  for(const currency of ['C$','$','USD'])for(const scale of ['','en miles','en millones']){
    const {c}=fixture();c.currency=currency;c.scale=scale;c.params.budget.context=B.context(c);
    const a=L.analyze(c);assert.equal(a.currency,currency);assert.equal(a.scale,scale);
    near(a.sales,300000);near(a.gao,2.4);assert.equal(C.fmt.unit(a),C.fmt.unit(c));
    assert.equal(C.fmt.money(-15000,a),'−'+currency+' 15,000.00');
  }
});
test('Se recalcula al cambiar ventas, costos, gastos, intereses o proyección activa',()=>{
  let {c,s}=fixture(3);let a=L.analyze(c);
  near(a.sales,900000);near(a.gao,2.4);
  s.products[0].values['2026-10'].units=600;
  a=L.analyze(c);near(a.sales,1200000);near(a.ebt,B.analyze(c).totals.ebt);
  s.products[0].values['2026-11'].unitCost=650;s.expenses[0].values['2026-12']=80000;s.result.interest['2026-12']=5000;
  near(L.analyze(c).ebt,B.analyze(c).totals.ebt);
  const alternate=structuredClone(s);alternate.id='alternate';alternate.name='Alternativa';
  alternate.products[0].values['2026-10'].price=2000;c=B.saveProjection(c,alternate);
  assert.equal(L.analyze(c).projectionName,'Alternativa');near(L.analyze(c).sales,1800000);
});
test('Proyecciones anteriores y casos límite de sensibilidad mantienen compatibilidad',()=>{
  const {c}=fixture();const old=B.blank(c);
  Object.assign(old,{inventoryUnits:0,inventoryPercent:0,nextUnits:300,openingSource:'manual',opening:{inventory:0},
    months:[{month:'2026-10',units:300,price:1000,unitCost:600,opex:70000,depreciation:0,otherIncome:0,interest:10000,taxes:0,capex:0,financing:0,dividends:0}]});
  c.params.budget=old;const a=L.analyze(c);assert.equal(a.unavailable,false,a.reason);near(a.gao,2.4);
  near(L.scenario(a,-100).sales,0);near(L.scenario(a,-100).ebt,-80000);
  near(L.scenario(a,1000).sales,3300000);
  assert.equal(L.scenario(a,-101),null);assert.equal(L.scenario(a,NaN),null);
  const large=fixture();large.s.products[0].values['2026-10'].price=1e12;
  assert.equal(Number.isFinite(L.analyze(large.c).gao),true);
});
