/* Adaptador académico de razones: conserva el motor compartido y sus estados originales. */
(function(root){
  'use strict';
  const C=typeof module==='object'&&module.exports?require('./casos.js'):root.FinoraCasos,F=C.engine;
  const finite=Number.isFinite;
  const absent=(formula,reason)=>({value:null,unit:'days',formula,reason});
  function analyze(c,b=C.analyzeBalance(c),i=C.analyzeIncome(c)){
    const output=C.ratios(c,b,i),settings=c.params?.academicAnalysis||{},previous=b.engine.previous,current=b.engine.current;
    for(const side of C.SIDES){
      const result=output[side],income=i.statements[side];if(!result||!income)continue;
      const common=income.commonProfit, sales=income.sales;
      if(result.profitability?.metrics){result.profitability.metrics.netMargin={value:finite(common)&&finite(sales)&&sales>0?common/sales:null,unit:'percent',formula:'Ganancias disponibles para accionistas comunes / ventas',reason:!finite(common)?'Indica los dividendos preferentes, o cero si no existen.':'Ventas no disponibles o iguales a cero.'};}
      const requested=settings[side]||{},givenSales=requested.creditSales,givenRate=requested.purchaseRate;
      if(side!=='current'||!previous||!current){result.activity={method:'missing',metrics:Object.fromEntries(['inventoryTurnover','inventoryDays','receivableTurnover','collectionDays','payableTurnover','paymentDays','fixedTurnover','assetTurnover'].map(key=>[key,absent('', 'Se necesitan los saldos inicial y final del período; no se dispone de un balance anterior.')])),cce:null};continue;}
      if(givenSales!=null&&(!finite(givenSales)||givenSales<0||(finite(sales)&&givenSales>sales))){result.activity={error:'Las ventas a crédito deben estar entre cero y las ventas totales.',cce:null};continue;}
      const parameters={days:365,purchasesMethod:'percent',purchaseRate:finite(givenRate)?givenRate/100:0,allSalesCredit:false};
      const inputs={...income,creditSales:finite(givenSales)?givenSales:income.creditSales};
      try{
        const a=F.calculateActivity(current,inputs,previous,parameters);
        if(!finite(income.creditPurchases)&&!finite(givenRate)){
          const reason='Indica las compras a crédito o el porcentaje estimado sobre costo de ventas.';
          a.metrics.payableTurnover=absent('Compras a crédito / CxP promedio',reason);a.metrics.payableTurnover.unit='times';
          a.metrics.paymentDays=absent('CxP promedio × 365 / compras a crédito',reason);
        }
        const {inventoryDays,collectionDays,paymentDays}=a.metrics;
        a.cce=[inventoryDays,collectionDays,paymentDays].every(m=>finite(m.value))?inventoryDays.value+collectionDays.value-paymentDays.value:null;
        a.creditSource=finite(givenSales)?'Ventas a crédito indicadas':income.creditSales!=null?'Ventas a crédito del estado':'Ventas a crédito pendientes';
        a.purchaseSource=income.creditPurchases!=null?'Compras a crédito del estado':finite(givenRate)?`Compras estimadas: ${givenRate}% del costo de ventas`:'Compras a crédito pendientes';
        result.activity=a;
      }catch(error){result.activity={error:error.message,cce:null};}
    }
    return output;
  }
  function retained(c,i=C.analyzeIncome(c)){
    const rows=(c.balance||[]).filter(a=>/^(?:utilidades|ganancias) retenidas$/i.test(String(a.name||'').trim()));
    const values=side=>rows.length&&rows.every(a=>finite(a.amounts?.[side]))?rows.reduce((sum,a)=>sum+(a.sign??1)*a.amounts[side],0):null;
    const prior=values('previous'),current=values('current'),net=i.statements.current?.netProfit;
    const unspecified=c.reported?.['income:unspecifiedDividends']?.current,common=c.reported?.['income:commonDividends']?.current,preferred=i.statements.current?.preferredDividends;
    const paid=finite(unspecified)?(!finite(common)&&(!finite(preferred)||preferred===0)?unspecified:null):finite(common)&&finite(preferred)?common+preferred:null;
    return {prior,current,change:finite(prior)&&finite(current)?current-prior:null,paid,fromIncome:finite(net)&&finite(paid)?net-paid:null,reported:c.reported?.['income:retainedChange']?.current??null};
  }
  const api={analyze,retained};if(typeof module==='object'&&module.exports)module.exports=api;else root.FinoraAcademicAnalysis=api;
})(typeof globalThis!=='undefined'?globalThis:this);
