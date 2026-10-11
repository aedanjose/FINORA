/* Dos estados revisados se construyen juntos, sin escribir en el almacén. */
(function(root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const P = node ? require('./paste-import.js') : root.FinoraPaste;
  const clone = value => JSON.parse(JSON.stringify(value));
  function emptyStatements(model) { const next=clone(model); next.balance=[]; next.income=[]; return next; }
  function pairErrors(balance,income) {
    const errors=[];
    if (['previous','current'].some(side=>String(balance.periods[side])!==String(income.periods[side]))) errors.push({code:'workbook-periods',message:'El balance y los resultados deben corresponder a los mismos años. Revisa los años de ambas hojas.'});
    for (const key of ['currency','scale']) if(balance.units?.[key] && income.units?.[key] && balance.units[key]!==income.units[key]) errors.push({code:'workbook-units',message:'Las dos hojas declaran distintas monedas o escalas. Corrige el archivo antes de guardarlas juntas.'});
    return errors;
  }
  function buildCase(model,balance,income) {
    if(balance.kind!=='balance'||income.kind!=='income'||balance.mode==='append'||income.mode==='append') throw new Error('Selecciona un balance y un estado de resultados para reemplazar ambos estados.');
    const errors=pairErrors(balance,income); if(errors.length) throw new Error(errors.map(e=>e.message).join('\n'));
    let next=emptyStatements(model);
    next=P.buildCase(next,balance); next=P.buildCase(next,income); return next;
  }
  const api={emptyStatements,pairErrors,buildCase};
  if(node) module.exports=api; else root.FinoraWorkbook=api;
})(typeof globalThis!=='undefined'?globalThis:this);
