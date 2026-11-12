/* Vista de orígenes y aplicaciones basada exclusivamente en el flujo existente. */
(function(root){
  'use strict';
  const W=typeof module==='object'&&module.exports?require('./cash-flow.js'):root.FinoraCashFlow;
  const finite=Number.isFinite;
  const TOLERANCE=0.01;
  const amount=(v,c)=>`${c.currency||''} ${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}${c.scale?' '+c.scale:''}`.trim();
  function analyze(c,provided){
    const flow=W.analyze(c,provided),accounts=new Map(flow.accounts.map(a=>[a.id,a])),origins=[],applications=[],issues=[...flow.issues];
    const previous=String(c.periods?.previous??'').trim(),current=String(c.periods?.current??'').trim();
    const placeholder=/^(anterior|actual|previous|current)$/i;
    const yearPair=/^\d{4}$/.test(previous)&&/^\d{4}$/.test(current),datePair=/^\d{4}-\d{2}-\d{2}$/.test(previous)&&/^\d{4}-\d{2}-\d{2}$/.test(current);
    if(!previous||!current||placeholder.test(previous)||placeholder.test(current)||previous===current||(yearPair&&Number(previous)>=Number(current))||(datePair&&previous>=current))issues.push({code:'periods',message:'Indica dos períodos diferentes y ordenados para comparar los balances.'});
    if(typeof c.currency!=='string'||!c.currency.trim()||(c.scale!=null&&typeof c.scale!=='string'))issues.push({code:'units',message:'Indica una moneda y una escala coherentes para ambos períodos.'});
    const ids=flow.accounts.map(a=>a.id).filter(id=>id!=null);
    if(new Set(ids).size!==ids.length)issues.push({code:'duplicate',message:'Hay identificadores de cuenta duplicados; revisa el balance antes de conciliar.'});
    const contra=flow.rows.filter(r=>{const a=accounts.get(r.id);return a?.section==='asset'&&a.sign===-1&&/depreci|amortiz|agotamiento/i.test(a.name)&&!r.excluded;});
    const adjustment=flow.rows.find(r=>r.id==='investing-depreciation');
    const netPair=adjustment&&contra.length>0;
    const unpairedContra=!adjustment&&contra.some(r=>!finite(r.amount)||r.amount!==0);
    if(unpairedContra)issues.push({code:'contra',message:'La variación de depreciación acumulada no tiene una compensación identificada en el flujo. Revisa su clasificación y los movimientos sin efectivo antes de conciliar.'});
    const paired=new Set(netPair?[adjustment.id,...contra.map(r=>r.id)]:unpairedContra?contra.map(r=>r.id):[]);
    const describe=(r,account)=>{
      if(r.id==='profit')return r.amount>=0?'La utilidad neta aporta fondos; no equivale por sí sola al efectivo generado.':'La pérdida neta representa una aplicación de fondos.';
      if(r.id==='depreciation')return 'Gasto sin salida de efectivo: se suma a la utilidad para determinar los fondos.';
      if(account&&finite(r.before)&&finite(r.after)){
        const direction=r.after>r.before?'subió':r.after<r.before?'bajó':'no cambió',movement=amount(r.amount,c),side=account.section==='asset'?'activo':account.section==='liability'?'pasivo':'patrimonio';
        if(account.section==='liability' && /proveedor/i.test(r.label))return `${r.label} ${direction} ${movement}: ${r.amount>0?'aumentó el financiamiento de proveedores → Origen':'se redujo el financiamiento de proveedores → Aplicación'}.`;
        if(account.section==='liability')return `${r.label} ${direction} ${movement}: ${r.amount>0?'aumentó una obligación → Origen':'se redujo una obligación → Aplicación'}.`;
        return `${r.label} ${direction} ${movement}: ${side} ${r.amount>0?'libera o aporta fondos → Origen':'requiere o destina fondos → Aplicación'}.`;
      }
      return r.detail||'Efecto informado en el flujo de efectivo.';
    };
    const append=(r,account)=>{if(!finite(r.amount)||r.amount===0)return;const item={id:r.id,label:r.label,amount:Math.abs(r.amount),reason:describe(r,account),activity:r.activity};(r.amount>0?origins:applications).push(item);};
    flow.rows.filter(r=>!r.excluded&&!paired.has(r.id)).forEach(r=>append(r,accounts.get(r.id)));
    if(netPair){const parts=[...contra,adjustment];const effect=parts.every(r=>finite(r.amount))?parts.reduce((sum,r)=>sum+r.amount,0):null;append({id:'net-depreciation',label:'Variación neta de depreciación acumulada',amount:effect,activity:'investing',detail:'Diferencia entre la variación de la contracuenta y la depreciación incorporada al flujo; revisa bajas u otros movimientos sin efectivo.'});}
    const known=flow.accounts.length>0&&!issues.some(i=>!['cash','balance'].includes(i.code))&&flow.rows.filter(r=>!r.excluded).every(r=>finite(r.amount)),totalOrigin=known?origins.reduce((s,r)=>s+r.amount,0):null,totalApplication=known?applications.reduce((s,r)=>s+r.amount,0):null;
    const cashChange=finite(flow.opening)&&finite(flow.closing)?flow.closing-flow.opening:null;
    const net=known?totalOrigin-totalApplication:null;
    const difference=finite(net)&&finite(cashChange)?net-cashChange:null;
    const cashMovement=finite(cashChange)&&cashChange!==0?{side:cashChange>0?'application':'origin',amount:Math.abs(cashChange)}:null;
    const adjustedOrigin=finite(totalOrigin)&&finite(cashChange)?totalOrigin+(cashChange<0?-cashChange:0):null;
    const adjustedApplication=finite(totalApplication)&&finite(cashChange)?totalApplication+(cashChange>0?cashChange:0):null;
    const floatingError=known&&finite(cashChange)?Math.min(1e-6,Number.EPSILON*Math.max(1,Math.abs(totalOrigin),Math.abs(totalApplication),Math.abs(cashChange))*4):0;
    const status=!flow.complete||issues.length||!known||!finite(cashChange)?'incomplete':Math.abs(difference)<=TOLERANCE+floatingError?'reconciled':'difference';
    return {origins,applications,totalOrigin,totalApplication,net,cashChange,cashMovement,adjustedOrigin,adjustedApplication,difference,status,issues,confirmed:flow.confirmed,tolerance:TOLERANCE,flow:{opening:flow.opening,closing:flow.closing,net:flow.net,difference:flow.difference,status:flow.status,sums:flow.sums}};
  }
  const api={analyze,TOLERANCE};if(typeof module==='object'&&module.exports)module.exports=api;else root.FinoraSourcesUses=api;
})(typeof globalThis!=='undefined'?globalThis:this);
