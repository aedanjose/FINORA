'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/js/casos.js'),B=require('../assets/js/budget.js');
const I=require('../assets/js/budget-import.js'),reference=require('./fixtures/buen-precio.json');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
function fixture(frequency='monthly',count=3) {
  const c=C.blankCase('Presupuestos por etapas'),s=B.newProjection(c);
  s.config={frequency,start:'2026-10-01',count};
  const p=s.products[0];Object.assign(p,{name:'Producto A',initialUnits:18,initialValue:5040,inventoryPercent:20,nextUnits:140});
  B.periodList(s.config).forEach((period,i)=>p.values[period.key]={units:80+20*i,price:500,unitCost:280});
  return {c,s,p};
}
test('Ventas se resuelve sin balance, gastos, impuestos ni políticas de inventario',()=>{
  const {c,s,p}=fixture();p.initialUnits=null;p.initialValue=null;p.inventoryPercent=null;p.nextUnits=null;
  const r=B.analyzeProducts(c,s);assert.equal(r.stages.sales.ready,true);assert.equal(r.stages.purchases.ready,false);
  assert.equal(r.products[0].totals.sales,150000);assert.equal(c.income[0].amounts.current,null);
});
test('Compras e inventario encadenados y costo por identidad de valores',()=>{
  const {c,s}=fixture(),r=B.analyzeProducts(c,s),p=r.products[0];
  assert.equal(r.stages.costs.ready,true);assert.deepEqual(p.rows.map(x=>x.purchaseUnits),[82,104,124]);
  assert.deepEqual(p.rows.map(x=>x.openingUnits),[18,20,24]);assert.equal(p.totals.purchases,86800);
  close(p.totals.costSales,84000);close(p.rows.at(-1).inventory,7840);
});
test('Uno, dos, tres, seis, doce meses y horizonte personalizado generan períodos completos',()=>{
  for(const count of [1,2,3,6,12,18,36]){const {c,s}=fixture('monthly',count);const r=B.analyzeProducts(c,s);assert.equal(r.rows.length,count);assert.equal(r.stages.costs.ready,true);}
});
test('Uno, dos, tres, cinco años y fecha de inicio conservan incrementos anuales',()=>{
  for(const count of [1,2,3,5,7]){const {c,s}=fixture('annual',count);const r=B.analyzeProducts(c,s);assert.equal(r.rows.length,count);assert.equal(r.rows.at(-1).month,String(2026+count-1));assert.equal(r.periods[0].months,12);assert.equal(r.stages.costs.ready,true);}
  assert.equal(B.periodList({frequency:'monthly',start:'2024-01-31',count:3})[1].start,'2024-02-29');
});
test('Múltiples productos mantienen valoraciones separadas y consolidan importes',()=>{
  const {c,s,p}=fixture(),second=structuredClone(p);second.id='second';second.name='Producto B';second.initialValue=2520;
  for(const v of Object.values(second.values)){v.price=250;v.unitCost=140;}
  s.products.push(second);const r=B.analyzeProducts(c,s);
  close(r.products[1].totals.sales,75000);close(r.rows.reduce((a,v)=>a+v.sales,0),225000);close(r.rows.reduce((a,v)=>a+v.costSales,0),126000);
});
test('Precios y costos variables conservan unidades y costo promedio ponderado periódico',()=>{
  const {c,s,p}=fixture();p.values['2026-10'].unitCost=300;p.values['2026-11'].price=550;
  const r=B.analyzeProducts(c,s),rows=r.products[0].rows;
  close(rows[0].averageCost,296.4);close(rows[0].inventory,5928);close(rows[1].sales,55000);
  close(rows.reduce((a,v)=>a+v.costSales,0)+rows.at(-1).inventory,5040+rows.reduce((a,v)=>a+v.purchases,0));
});
test('Inventario final manual y redondeo configurable respetan unidades indivisibles',()=>{
  const {c,s,p}=fixture();p.inventoryMode='manual';p.nextUnits=null;p.inventoryPercent=null;
  for(const v of Object.values(p.values))v.targetUnits=20.4;
  p.rounding='ceil';let r=B.analyzeProducts(c,s);assert.equal(r.products[0].rows[0].targetInventory,21);assert.equal(r.products[0].rows[0].purchaseUnits,83);
  p.rounding='floor';r=B.analyzeProducts(c,s);assert.equal(r.products[0].rows[0].targetInventory,20);
  p.rounding='nearest';r=B.analyzeProducts(c,s);assert.equal(r.products[0].rows[0].targetInventory,20);
  p.rounding='none';r=B.analyzeProducts(c,s);close(r.products[0].rows[0].targetInventory,20.4);
});
test('Ceros, negativos, fechas inválidas y períodos incompletos se distinguen',()=>{
  const {c,s,p}=fixture();p.values['2026-10'].price=0;assert.equal(B.analyzeProducts(c,s).products[0].rows[0].sales,0);
  p.values['2026-10'].price=null;assert.equal(B.analyzeProducts(c,s).stages.sales.ready,false);
  p.values['2026-10'].price=-1;assert.equal(B.analyzeProducts(c,s).products[0].rows[0].sales,null);
  s.config.start='2026-02-30';assert.equal(B.analyzeProducts(c,s).stages.configuration.ready,false);
});

function academic(){const {c,s}=fixture();return {c,s:I.parseAcademic({rows:reference.sheets.Datos.values,problems:[]},c,s)};}
test('Excel El Buen Precio: importa supuestos y reproduce todos los resultados de referencia',()=>{
  const {c,s}=academic(),before=JSON.stringify(c),r=B.analyze(c,s);assert.equal(r.stages.income.ready,true,JSON.stringify(r.issues));
  const references=[['Ventas',5,'sales'],['Compras',6,'purchaseUnits'],['Compras',8,'purchases'],['Costo de ventas',11,'costSales'],['Gastos operativos',8,'operatingExpenses'],['Estado de resultados',5,'grossProfit'],['Estado de resultados',7,'ebit'],['Estado de resultados',9,'ebt'],['Estado de resultados',10,'taxes'],['Estado de resultados',11,'netProfit']];
  for(const [sheet,row,key] of references)for(let i=0;i<3;i++)close(r.rows[i][key],reference.sheets[sheet].values[row][i+1]);
  close(r.totals.sales,351000);close(r.totals.purchases,214700);close(r.totals.costSales,205200);close(r.totals.netProfit,60900);close(r.products[0].rows[1].endingUnits,52.5);
  assert.equal(JSON.stringify(c),before);assert.equal(r.stages.balance.ready,false);
});
test('Gastos históricos: prorratea, ajusta y clasifica depreciación una vez sin modificar cuentas',()=>{
  const {c,s}=academic();c.income=[{id:'admin',name:'Gastos administrativos',category:'opex',sign:1,amounts:{previous:100000,current:132000}},{id:'dep',name:'Depreciación',category:'opex',sign:1,amounts:{previous:7200,current:8400}}];
  const history=JSON.stringify(c.income);s.expenses=B.historicalExpenses(c);s.expenses[0].mode='adjusted';s.expenses[0].adjustment=10;
  let r=B.analyze(c,s);close(r.rows[0].administration,12100);close(r.rows[0].depreciation,700);close(r.rows[0].operatingExpenses,12800);
  s.expenses[0].adjustmentType='amount';s.expenses[0].adjustment=-500;r=B.analyze(c,s);close(r.rows[0].administration,10500);
  s.config.frequency='annual';s.config.count=1;s.config.start='2026-01-01';r=B.analyze(c,s);close(r.rows[0].administration,131500);close(r.rows[0].depreciation,8400);
  s.expenses.push(structuredClone(s.expenses[0]));assert.equal(B.analyze(c,s).stages.expenses.ready,false);assert.equal(JSON.stringify(c.income),history);
});
test('Gastos faltantes, clasificación y depreciación opcional no bloquean ventas ni compras',()=>{
  const {c,s}=academic();s.expenses=[];let r=B.analyze(c,s);assert.equal(r.stages.sales.ready,true);assert.equal(r.stages.purchases.ready,true);assert.equal(r.stages.income.ready,false);assert.equal(r.rows[0].netProfit,null);
  s.expensesNone=true;r=B.analyze(c,s);assert.equal(r.stages.income.ready,true);close(r.totals.depreciation,0);
  s.expensesNone=false;s.expenses=[{id:'x',label:'Por clasificar',category:'unclassified',mode:'manual',values:{'2026-10':5,'2026-11':5,'2026-12':5}}];assert.equal(B.analyze(c,s).stages.expenses.ready,false);
});
test('Intereses desde deuda, otros ingresos/gastos y base imponible tienen cálculo verificable',()=>{
  const {c,s}=academic();s.result.interestMode='debt';s.result.debt={principal:12000,annualRate:12,termMonths:12,amortization:'equalPrincipal'};
  s.result.otherEnabled=true;s.result.otherIncome={'2026-10':100,'2026-11':0,'2026-12':0};s.result.otherExpenses={'2026-10':50,'2026-11':0,'2026-12':0};s.result.taxAdjustments={'2026-10':-100};
  const r=B.analyze(c,s);assert.deepEqual(r.rows.map(x=>x.interest),[120,110,100]);close(r.rows[0].ebt,22030);close(r.rows[0].taxableBase,21930);close(r.rows[0].taxes,6579);close(r.rows[0].netProfit,15451);
  s.result.taxAdjustments['2026-10']=-100000;close(B.analyze(c,s).rows[0].taxes,0);
  s.result.interestMode='historical';s.historyMonths=12;c.income=[{category:'interest',sign:1,amounts:{current:9600}}];close(B.analyze(c,s).rows[0].interest,800);
});
test('Amortización anual acumula cuotas y cesa al vencimiento',()=>{
  const {c,s}=fixture('annual',2);s.expensesNone=true;s.result.taxMode='none';s.result.interestMode='debt';s.result.debt={principal:12000,annualRate:12,termMonths:12,amortization:'equalPrincipal'};
  let r=B.analyze(c,s);close(r.rows[0].interest,780);close(r.rows[0].principalPayment,12000);close(r.rows[1].interest,0);
  s.result.debt.amortization='interestOnly';r=B.analyze(c,s);close(r.rows[0].interest,1440);close(r.rows[0].principalPayment,12000);
});
test('Caja y balance avanzados: validación independiente y conciliación con inventarios',()=>{
  const {c,s}=academic();s.advanced.enabled=true;let r=B.analyze(c,s);assert.equal(r.stages.income.ready,true);assert.equal(r.stages.cash.ready,false);
  Object.assign(s.advanced,{openingSource:'manual',opening:Object.fromEntries(Object.keys(B.openingFields).map(k=>[k,0])),collectionPercent:100,paymentPercent:100,confirmed:true,baseSignature:B.signature(c)});
  Object.assign(s.advanced.opening,{cash:50000,inventory:13300,fixed:10000,equity:73300});r=B.analyze(c,s);assert.equal(r.ready,true,JSON.stringify(r.issues));close(r.closing.difference,0);
  s.advanced.opening.inventory=0;assert.equal(B.analyze(c,s).stages.balance.ready,false);assert.equal(B.analyze(c,s).stages.income.ready,true);
});
test('Múltiples proyecciones, contexto y migración conservan históricos y versiones anteriores',()=>{
  const {c,s}=academic(),before=JSON.stringify(c);const first=B.saveProjection(c,s),other=structuredClone(s);other.id='second';other.name='Alternativa';other.products[0].values['2026-10'].price=700;
  const saved=B.saveProjection(first,other);assert.equal(saved.params.budgetProjections.length,2);close(B.analyze(saved,saved.params.budgetProjections[0]).totals.sales,351000);assert.equal(JSON.stringify(c),before);assert.deepEqual(saved.income,c.income);
  const old=B.blank(c);c.params.budget=old;const upgraded=B.upgrade(c,old);assert.equal(upgraded.version,2);assert.equal(B.saveProjection(c,upgraded).params.budgetArchive.length,1);
  s.context='old-context';assert.throws(()=>B.saveProjection(c,s),/contexto/);
});
test('Las existencias del presupuesto son independientes del inventario complementario',()=>{
  const {c,s}=academic(),before=B.analyze(c,s);
  c.params.inventory={context:B.context(c),products:[{id:'one',name:s.products[0].name,units:999,cost:1}]};
  const after=B.analyze(c,s);assert.deepEqual(after.rows,before.rows);
  const saved=B.saveProjection(c,s);close(saved.params.budget.products[0].initialUnits,35);close(saved.params.budget.products[0].initialValue,13300);
  close(B.analyze(saved).totals.netProfit,60900);assert.deepEqual(saved.params.inventory,c.params.inventory);
});
test('Importación por producto y período: anual, manual mapping, duplicados y errores de fórmulas',()=>{
  const config={frequency:'annual',count:2,start:'2026-01-01'},data={rows:[['Producto','Período','Unidades','Precio unitario','Costo unitario'],['A',2026,10,50,20],['A',2027,12,55,25],['B',2026,5,80,30]],problems:[]};
  const products=I.parseProjection(data,config);assert.equal(products.length,2);close(products[0].values['2027'].price,55);assert.equal(products[1].values['2027'],undefined);
  data.rows.push(['A',2026,1,2,3]);assert.throws(()=>I.parseProjection(data,config),/duplicados/);data.rows.pop();data.problems.push({r:1,c:2,address:'C2',message:'Fórmula sin valor'});assert.throws(()=>I.parseProjection(data,config),/C2/);
});
