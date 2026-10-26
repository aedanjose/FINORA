'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/js/casos.js'),B=require('../assets/js/budget.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(frequency='monthly'){
  const c=C.blankCase('Caja académica'),s=B.newProjection(c);
  s.config={frequency,start:'2026-01-01',count:3};
  const periods=B.periodList(s.config),product=s.products[0];
  Object.assign(product,{initialUnits:0,initialValue:0,inventoryMode:'manual'});
  s.expenses=[{id:'opex',label:'Administración',category:'administration',mode:'manual',values:{}},{id:'dep',label:'Depreciación',category:'depreciation',mode:'manual',values:{}}];
  Object.assign(s.result,{interestMode:'manual',taxMode:'manual',otherEnabled:true});
  Object.assign(s.advanced,{enabled:true,openingSource:'manual',opening:Object.fromEntries(Object.keys(B.openingFields).map(k=>[k,0])),collectionPercent:60,paymentPercent:50,confirmed:true,baseSignature:B.signature(c)});
  Object.assign(s.advanced.opening,{cash:200,receivables:100,payables:50,fixed:100,longDebt:200,equity:150});
  periods.forEach((p,i)=>{
    product.values[p.key]={units:[10,20,15][i],price:100,unitCost:40,targetUnits:0};
    s.expenses[0].values[p.key]=50;s.expenses[1].values[p.key]=10;
    s.result.interest[p.key]=5;s.result.taxes[p.key]=10;s.result.otherIncome[p.key]=20;s.result.otherExpenses[p.key]=7;
    s.advanced.values[p.key]={capex:30,dividends:8,financing:0,minimumCash:[600,1000,2500][i]};
  });
  c.params.budget=s;return {c,s,periods};
}
test('Cobros y pagos separan contado, crédito anterior y saldos iniciales, sin duplicarlos',()=>{
  const {c}=fixture(),r=B.analyze(c);
  assert.deepEqual(r.rows.map(x=>x.currentCollections),[600,1200,900]);
  assert.deepEqual(r.rows.map(x=>x.creditCollections),[0,400,800]);
  assert.deepEqual(r.rows.map(x=>x.initialReceivablesCollected),[100,0,0]);
  assert.deepEqual(r.rows.map(x=>x.collections),[700,1600,1700]);
  assert.deepEqual(r.rows.map(x=>x.currentPayments),[200,400,300]);
  assert.deepEqual(r.rows.map(x=>x.creditPayments),[0,200,400]);
  assert.deepEqual(r.rows.map(x=>x.initialPayablesPaid),[50,0,0]);
  assert.deepEqual(r.rows.map(x=>x.payments),[250,600,700]);
  assert.deepEqual(r.rows.map(x=>x.receivables),[400,800,600]);
  assert.deepEqual(r.rows.map(x=>x.payables),[200,400,300]);
  near(r.totals.collections+r.closing.receivables,100+r.totals.sales);
  near(r.totals.payments+r.closing.payables,50+r.totals.purchases);
});
test('Caja académica concilia entradas, salidas, continuidad y Balance General',()=>{
  const {c}=fixture(),before=structuredClone(c),r=B.analyze(c);
  assert.equal(r.ready,true);assert.equal(r.cashMinimum.ready,true);
  assert.deepEqual(r.rows.map(x=>x.cash),[560,1470,2380]);
  assert.deepEqual(r.rows.map(x=>x.openingCash),[200,560,1470]);
  near(r.rows[0].cashAvailable,920);near(r.rows[0].cashOutflows,360);
  near(r.rows[0].taxesAndInterest,15);near(r.rows[0].otherDisbursements,45);
  for(const x of r.rows){near(x.cashAvailable,x.openingCash+x.cashInflows);near(x.cashBeforeFinancing,x.cashAvailable-x.cashOutflows);near(x.cash,x.cashBeforeFinancing+x.financing);}
  near(r.closing.cash,2380);near(r.closing.difference,0);near(r.closing.fixed,160);
  near(r.totals.cashInflows,4060);near(r.totals.cashOutflows,1880);
  assert.deepEqual(c,before);assert.notEqual(r.totals.netProfit,r.totals.cashMovement);
});
test('Caja positiva inferior al mínimo produce faltante y advertencia sin préstamos automáticos',()=>{
  const {c}=fixture(),r=B.analyze(c);
  assert.deepEqual(r.rows.map(x=>x.cashSurplus),[0,470,0]);
  assert.deepEqual(r.rows.map(x=>x.cashShortfall),[40,0,120]);
  assert.deepEqual(r.rows.map(x=>x.financingRequired),[40,0,120]);
  assert.deepEqual(r.rows.map(x=>x.financing),[0,0,0]);
  near(r.closing.longDebt,200);assert.equal(r.status,'review');
  assert.ok(r.warnings.some(x=>x.includes('inferior al mínimo')));
});
test('Mínimo, ventas, compras y gastos recalculan dependencias sin alterar la utilidad por la reserva',()=>{
  const {c,s,periods}=fixture(),key=periods[0].key,base=B.analyze(c);
  s.advanced.values[key].minimumCash=550;let r=B.analyze(c);near(r.rows[0].cashSurplus,10);near(r.rows[0].cashShortfall,0);near(r.closing.cash,base.closing.cash);near(r.totals.netProfit,base.totals.netProfit);
  s.products[0].values[key].price=110;r=B.analyze(c);near(r.rows[0].collections,760);near(r.rows[1].creditCollections,440);near(r.rows[0].cash,620);
  s.products[0].values[key].unitCost=50;r=B.analyze(c);near(r.rows[0].payments,300);near(r.rows[1].creditPayments,250);near(r.rows[0].cash,570);
  s.expenses[0].values[key]=100;r=B.analyze(c);near(r.rows[0].cash,520);near(r.rows[0].financingRequired,30);near(r.closing.difference,0);
});
test('Financiamiento registrado cubre total o parcialmente la necesidad y se traslada una sola vez',()=>{
  const {c,s,periods}=fixture(),key=periods[0].key;
  s.advanced.values[key].financing=20;let r=B.analyze(c);near(r.rows[0].financingRequired,40);near(r.rows[0].remainingShortfall,20);near(r.rows[0].cash,580);near(r.rows[1].openingCash,580);
  s.advanced.values[key].financing=40;r=B.analyze(c);near(r.rows[0].remainingShortfall,0);near(r.rows[0].cash,600);near(r.closing.longDebt,240);near(r.closing.difference,0);
  s.advanced.values[key].financing=-100;r=B.analyze(c);near(r.rows[0].cash,460);near(r.closing.longDebt,100);near(r.closing.difference,0);
});
test('Amortizaciones automáticas integran el financiamiento neto una vez, sin duplicar salidas',()=>{
  const {c,s,periods}=fixture();s.result.interestMode='debt';s.result.debt={principal:120,annualRate:12,termMonths:12,amortization:'equalPrincipal'};s.advanced.useDebtSchedule=true;s.advanced.values[periods[0].key].financing=50;
  const r=B.analyze(c);near(r.rows[0].principalPayment,10);near(r.rows[0].financing,40);near(r.rows[0].interest,1.2);near(r.rows[0].cashOutflows,356.2);near(r.rows[0].cash,603.8);near(r.closing.longDebt,220);near(r.closing.difference,0);
});
test('Políticas de 0% y 100% conservan el crédito y el pago único de saldos iniciales',()=>{
  for(const percent of [0,100]){const {c,s}=fixture();s.advanced.collectionPercent=percent;s.advanced.paymentPercent=percent;const r=B.analyze(c);
    assert.equal(r.ready,true);near(r.rows[0].collections,percent===0?100:1100);near(r.rows[0].payments,percent===0?50:450);
    near(r.rows[1].collections,percent===0?1000:2000);near(r.rows[1].payments,percent===0?400:800);near(r.closing.difference,0);
  }
});
test('Ceros y caja negativa distinguen faltantes; porcentajes y mínimos inválidos quedan pendientes',()=>{
  const {c,s,periods}=fixture(),key=periods[0].key;s.advanced.values[key].minimumCash=0;
  let r=B.analyze(c);near(r.rows[0].cashSurplus,560);near(r.rows[0].cashShortfall,0);
  s.expenses[0].values[key]=1000;r=B.analyze(c);near(r.rows[0].cash,-390);near(r.rows[0].financingRequired,390);
  for(const bad of [-1,'abc',Infinity]){s.advanced.values[key].minimumCash=bad;r=B.analyze(c);assert.equal(r.cashMinimum.ready,false);assert.equal(r.rows[0].cashShortfall,null);assert.equal(r.stages.cash.ready,false);near(r.rows[0].cash,-390);}
  s.advanced.values[key].minimumCash=0;
  for(const bad of [null,-1,101]){s.advanced.collectionPercent=bad;r=B.analyze(c);assert.equal(r.rows[0].collections,null);assert.equal(r.rows[0].cash,null);assert.equal(r.rows[0].cashSurplus,null);}
  s.advanced.collectionPercent=60;s.advanced.paymentPercent=101;assert.equal(B.analyze(c).rows[0].payments,null);
});
test('Proyecciones anteriores sin mínimo conservan resultados y guardan el nuevo supuesto por período',()=>{
  const {c,s,periods}=fixture();for(const p of periods)delete s.advanced.values[p.key].minimumCash;
  let r=B.analyze(c);assert.equal(r.ready,true);assert.equal(r.cashMinimum.ready,false);assert.equal(r.cashMinimum.issues.length,3);near(r.closing.cash,2380);assert.equal(r.rows[0].cashShortfall,null);
  s.advanced.values[periods[0].key].minimumCash=600;const saved=B.saveProjection(c,s),loaded=JSON.parse(JSON.stringify(saved));
  r=B.analyze(loaded);near(r.rows[0].cashShortfall,40);assert.equal(r.rows[1].minimumCash,null);near(r.closing.difference,0);assert.deepEqual(loaded.income,c.income);
});
test('Horizonte anual mantiene la política al período siguiente y el mínimo anual específico',()=>{
  const {c,periods}=fixture('annual'),r=B.analyze(c);assert.deepEqual(periods.map(p=>p.key),['2026','2027','2028']);
  assert.deepEqual(r.rows.map(x=>x.cash),[560,1470,2380]);assert.deepEqual(r.rows.map(x=>x.creditCollections),[0,400,800]);assert.deepEqual(r.rows.map(x=>x.cashShortfall),[40,0,120]);near(r.closing.difference,0);
});
module.exports={fixture};
