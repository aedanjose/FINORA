/* Lectura ejecutiva del mismo documento; los escenarios se conservan aparte de los estados. */
(function(root){
  'use strict';
  const node=typeof module==='object'&&module.exports,C=node?require('./casos.js'):root.FinoraCasos,W=node?require('./cash-flow.js'):root.FinoraCashFlow;
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const periodKey=c=>JSON.stringify(c.periods);
  const signature=c=>JSON.stringify([c.id,c.periods,c.balance,c.income]);
  const settingsFor=c=>c.params?.dashboard?.periodKey===periodKey(c)?{...c.params.dashboard}:{growth:8,marginPercent:null};
  function project(c,settings=settingsFor(c),income=C.analyzeIncome(c)){
    const current=income.statements.current, sales=current?.sales??null,profit=current?.netProfit??null;
    const growth=settings.growth??8,explicit=settings.marginPercent!==null&&settings.marginPercent!==undefined&&settings.marginPercent!=='';
    if(!finite(growth)||growth< -100||growth>200)throw new Error('El crecimiento debe estar entre −100 % y 200 %.');
    if(explicit&&(!finite(settings.marginPercent)||settings.marginPercent< -100||settings.marginPercent>100))throw new Error('El margen neto supuesto debe estar entre −100 % y 100 %.');
    const margin=explicit?settings.marginPercent/100:finite(profit)&&finite(sales)&&sales>0?profit/sales:null;
    const targetSales=finite(sales)&&sales>0?sales*(1+growth/100):null;
    const targetProfit=finite(targetSales)&&finite(margin)?targetSales*margin:null;
    const year=Number(c.periods.current),label=/^\d{4}$/.test(String(c.periods.current))&&year<2100?String(year+1):'Próximo período';
    return {growth,margin,marginPercent:finite(margin)?margin*100:null,explicitMargin:explicit,sales:targetSales,profit:targetProfit,profitChange:finite(targetProfit)&&finite(profit)?targetProfit-profit:null,label};
  }
  function analyze(c){
    const balance=C.analyzeBalance(c),income=C.analyzeIncome(c),indicators=C.indicators(c,balance,income),ratios=C.ratios(c,balance,income),checks=C.checks(c,balance,income);
    const sides=['previous','current'],pick=fn=>Object.fromEntries(sides.map(side=>[side,fn(side)??null]));
    const sales=pick(side=>income.statements[side]?.sales),profit=pick(side=>income.statements[side]?.netProfit),cash=pick(side=>balance.engine[side]?.provided?.cash===false?null:balance.engine[side]?.cash);
    const currentRatio=pick(side=>ratios[side]?.liquidity?.currentRatio?.value),debtRatio=pick(side=>ratios[side]?.debt?.debtRatio?.value);
    const margin=indicators.margins?.net||{previous:null,current:null};
    const compare=values=>C.engine.compareValues(values.previous,values.current);
    const state=checks.pending?'review':!finite(profit.current)?'incomplete':profit.current>0?'positive':profit.current<0?'negative':'neutral';
    const current=balance.engine.current;
    const composition={liabilities:current?.liabilities??null,equity:current?.equity??null,assets:current?.assets??null};
    const series={
      income:[['Ventas','sales'],['Costo de ventas','costSales'],['Gastos operativos','operatingExpenses'],['Utilidad neta','netProfit']].map(([label,key])=>({label,...pick(side=>income.statements[side]?.[key])})),
      balance:[['Activos','assets'],['Pasivos','liabilities'],['Patrimonio','equity']].map(([label,key])=>({label,...pick(side=>balance.engine[side]?.[key])})),
      cash:[{label:'Efectivo y equivalentes',...cash},{label:'Capital de trabajo',...indicators.workingCapital.values}]
    };
    return {balance,income,indicators,ratios,checks,sales,profit,cash,currentRatio,debtRatio,margin,composition,state,series,changes:{sales:compare(sales),profit:compare(profit),cash:compare(cash)},cashFlow:W.analyze(c),projection:project(c,settingsFor(c),income)};
  }
  const api={analyze,project,settingsFor,periodKey,signature};if(node)module.exports=api;else root.FinoraDashboard=api;
})(typeof globalThis!=='undefined'?globalThis:this);
