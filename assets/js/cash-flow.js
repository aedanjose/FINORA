/* Flujo académico indirecto: estimaciones trazables, ajustes explícitos y conciliación independiente. */
(function(root) {
  'use strict';
  const node=typeof module==='object'&&module.exports;
  const C=node?require('./casos.js'):root.FinoraCasos;
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const activities={operating:'Operación',investing:'Inversión',financing:'Financiamiento',exchange:'Efecto cambiario'};
  const periodKey=c=>JSON.stringify(c.periods);
  const signature=c=>JSON.stringify([c.periods,c.balance,c.income]);
  const settingsFor=c=>c.params?.cashFlow?.periodKey===periodKey(c)?structuredClone(c.params.cashFlow):{};
  function choices(account) {
    if(account.section==='equity') return ['equity'];
    if(account.section==='liability') return ['operating','financing','ignore'];
    return account.term==='current'?['cash','operating','investing','ignore']:['investing','operating','ignore'];
  }
  function suggest(account) {
    if(account.section==='equity') return 'equity';
    if(account.role==='cash') return 'cash';
    if(account.section==='asset') return account.term==='current'?'operating':'investing';
    if(account.role==='longDebt'||/prestam|deuda|financ|obligacion|pagare|arrendam|documentos? por pagar/.test(norm(account.name))) return 'financing';
    if(account.section==='liability'&&account.term==='current') return 'operating';
    return ''; // Un pasivo no corriente genérico no demuestra un préstamo.
  }
  const signed=(a,side)=>finite(a.amounts?.[side])?(a.sign??1)*a.amounts[side]:null;
  const total=values=>values.length&&values.every(finite)?values.reduce((a,b)=>a+b,0):null;
  function analyze(c,provided) {
    const settings=provided||settingsFor(c),rows=[],issues=[];
    const issue=(code,message)=>issues.push({code,message});
    const add=(id,label,activity,amount,source,detail,extra={})=>rows.push({id,label,activity,amount,source,detail,...extra});
    let profit=null;
    try {profit=C.analyzeIncome(c).statements.current?.netProfit??null;} catch(e) {issue('income',e.message);}
    if(!finite(profit)) issue('profit','Falta un estado de resultados completo del año actual para obtener la utilidad neta.');
    add('profit','Utilidad neta del período','operating',profit,'Resultados',`Utilidad neta de ${c.periods.current}.`);
    const daRows=(c.income||[]).filter(a=>['opex','costSales'].includes(a.category)&&/depreci|amortiz|agotamiento/.test(norm(a.name)));
    const detectedDepreciation=total(daRows.map(a=>signed(a,'current')));
    const hasManual=key=>settings[key]!==null&&settings[key]!==undefined&&settings[key]!=='';
    const value=key=>finite(settings[key])?settings[key]:null;
    const depreciation=hasManual('depreciation')?value('depreciation'):detectedDepreciation;
    if(!finite(depreciation)) issue('depreciation','Informa la depreciación y amortización del período; escribe 0 si no hubo.');
    else if(depreciation<0) issue('depreciation','La depreciación y amortización debe ser positiva o cero.');
    add('depreciation','Depreciación y amortización','operating',depreciation,hasManual('depreciation')?'Dato complementario':'Resultados','Gasto sin salida de efectivo: se suma a la utilidad.');
    const accounts=(c.balance||[]).map(a=>({...a,activity:settings.allocations?.[a.id]??suggest(a)}));
    const cash=accounts.filter(a=>a.activity==='cash');
    const opening=total(cash.map(a=>signed(a,'previous'))),closing=total(cash.map(a=>signed(a,'current')));
    if(!cash.length) issue('cash','Clasifica al menos una cuenta de activo corriente como efectivo y equivalentes.');
    else if(!finite(opening)||!finite(closing)) issue('cash','Completa el efectivo en ambos balances. Un espacio vacío no significa cero.');
    let investingAssets=false;
    const equity=[];
    for(const a of accounts) {
      if(!choices(a).includes(a.activity)) {issue('classification',`${a.name}: revisa su actividad en «Datos y clasificación».`);continue;}
      if(a.activity==='cash') continue;
      const before=signed(a,'previous'),after=signed(a,'current'),change=finite(before)&&finite(after)?after-before:null;
      if(a.activity==='ignore') {add(a.id,a.name,'excluded',null,'Excluida','No se considera un movimiento de efectivo.',{excluded:true});continue;}
      if(!finite(change)) issue('account',`${a.name}: falta un importe en uno de los balances; escribe 0 si la cuenta no existía.`);
      const effect=finite(change)?(a.section==='asset'?-change:change):null;
      if(a.activity==='equity') {equity.push(effect);continue;}
      if(a.activity==='investing'&&a.section==='asset'&&a.term==='noncurrent') investingAssets=true;
      add(a.id,a.name,a.activity,effect,'Balances','Variación entre saldos; estimación sujeta a operaciones sin efectivo.',{before,after,estimated:true});
    }
    if(investingAssets) add('investing-depreciation','Depreciación/amortización en activos no corrientes','investing',finite(depreciation)?-depreciation:null,'Estimación','Se incorpora a la variación del activo neto para estimar inversión. No es un pago separado.',{estimated:true});
    if(equity.length) {
      const change=total(equity),amount=finite(change)&&finite(profit)?change-profit:null;
      add('equity','Cambio de patrimonio, excluida la utilidad','financing',amount,'Estimación','Patrimonio actual − patrimonio anterior − utilidad actual. Puede incluir aportes, retiros o distribuciones; confirma que no haya cambios sin efectivo.',{estimated:true});
    }
    for(const activity of ['investing','financing']) {
      const key=activity+'Override';
      if(!hasManual(key)) continue;
      if(!finite(settings[key])) issue('override',`El flujo neto de ${activities[activity].toLowerCase()} debe ser un número válido.`);
      for(let i=rows.length-1;i>=0;i--) if(rows[i].activity===activity) rows.splice(i,1);
      add('override-'+activity,'Flujo neto de '+activities[activity].toLowerCase()+' informado',activity,value(key),'Dato complementario','Reemplaza la estimación de esta actividad por el flujo neto informado.');
    }
    if(hasManual('depreciation')&&!finite(settings.depreciation)) issue('number','La depreciación informada no es un número válido.');
    for(const adjustment of settings.adjustments||[]) {
      if(!Object.hasOwn(activities,adjustment.activity)||!String(adjustment.label||'').trim()||!finite(adjustment.amount)) {issue('adjustment','Cada ajuste necesita concepto, actividad e importe válidos.');continue;}
      add('adjustment-'+adjustment.id,String(adjustment.label).trim(),adjustment.activity,adjustment.amount,'Ajuste informado','Movimiento adicional o corrección informado por el usuario.');
    }
    const sums={};
    for(const activity of Object.keys(activities)) {const values=rows.filter(r=>r.activity===activity).map(r=>r.amount);sums[activity]=values.length?total(values):0;}
    if(!accounts.length) {sums.investing=null;sums.financing=null;}
    const net=issues.some(i=>['classification','cash'].includes(i.code))?null:total(Object.values(sums)),calculatedClosing=finite(opening)&&finite(net)?opening+net:null;
    const difference=finite(closing)&&finite(calculatedClosing)?closing-calculatedClosing:null;
    try {
      const b=C.analyzeBalance(c);
      for(const side of ['previous','current']) if(b.balanced[side]!==true) issue('balance',`El balance de ${c.periods[side]} está incompleto o no cuadra. Revisa Estados financieros.`);
    } catch(e) {issue('balance',e.message);}
    const known=accounts.filter(a=>a.activity!=='ignore').every(a=>finite(signed(a,'previous'))&&finite(signed(a,'current')));
    const complete=!issues.length&&known&&finite(net)&&finite(closing)&&finite(opening);
    const confirmed=settings.reviewedSignature===signature(c);
    const reconciled=complete&&finite(difference)&&Math.abs(difference)<=.01;
    const status=!complete?'incomplete':!reconciled?'difference':!confirmed?'estimated':'reconciled';
    const staleSettings=!!c.params?.cashFlow&&c.params.cashFlow.periodKey!==periodKey(c);
    return {rows,accounts,issues,sums,opening,closing,net,calculatedClosing,difference,profit,depreciation,detectedDepreciation,complete,confirmed,reconciled,status,staleSettings,settings};
  }
  const api={analyze,suggest,choices,signature,periodKey,settingsFor,activities};
  if(node) module.exports=api;else root.FinoraCashFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
