/* Respaldo local: conserva los valores originales y valida antes de escribir. */
(function(root){
  'use strict';
  const node=typeof module==='object'&&module.exports;
  const Personal=node?require('./personal-budget.js'):root.FinoraPersonal;
  const Assets=node?require('./fixed-assets.js'):root.FinoraAssets;
  const KEYS=['finora:casos:v1','finora:personal-budget:v1','finora:fixed-assets:v1','finora:presentation:v1','finora:global_currency'];
  const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function cases(v){
    if(!obj(v)||v.version!==1||!Array.isArray(v.cases)||!v.cases.length||typeof v.activeId!=='string'||(v.started!==undefined&&typeof v.started!=='boolean'))throw Error('El registro de empresas no tiene un formato compatible.');
    const ids=new Set();
    for(const c of v.cases){
      if(!obj(c)||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.name!=='string'||typeof c.currency!=='string'||typeof c.scale!=='string'||!obj(c.periods)||typeof c.periods.previous!=='string'||typeof c.periods.current!=='string'||!Array.isArray(c.balance)||!Array.isArray(c.income)||(c.params!==undefined&&!obj(c.params)))throw Error('Hay una empresa incompleta o con identificador duplicado.');
      ids.add(c.id);
      for(const row of [...c.balance,...c.income])if(!obj(row)||typeof row.name!=='string'||!obj(row.amounts)||!['previous','current'].every(k=>row.amounts[k]===null||typeof row.amounts[k]==='number'&&Number.isFinite(row.amounts[k])))throw Error('Hay cuentas financieras inválidas.');
    }
    if(!ids.has(v.activeId))throw Error('La empresa seleccionada no existe en el respaldo.');
  }
  function validateRaw(key,raw){
    if(raw===null)return;
    if(typeof raw!=='string')throw Error('El contenido de '+key+' no es válido.');
    if(key==='finora:presentation:v1'){if(!['on','off'].includes(raw))throw Error('Preferencia visual no válida.');return;}
    if(key==='finora:global_currency'){if(!raw.trim()||raw.length>6)throw Error('Moneda no válida.');return;}
    let value;try{value=JSON.parse(raw);}catch(_){throw Error('Datos JSON dañados en '+key+'.');}
    if(key==='finora:casos:v1')cases(value);
    else {const fake={getItem:()=>raw};(key==='finora:personal-budget:v1'?Personal:Assets).createStore(fake).load();}
  }
  function snapshot(storage){return Object.fromEntries(KEYS.map(key=>[key,storage.getItem(key)]));}
  function exportData(storage){const data=snapshot(storage);for(const key of KEYS)validateRaw(key,data[key]);if(KEYS.every(k=>data[k]===null))throw Error('No hay datos locales para respaldar.');return JSON.stringify({format:'finora-backup',version:1,createdAt:new Date().toISOString(),data},null,2);}
  function parse(text){
    let backup;try{backup=JSON.parse(text);}catch(_){throw Error('El archivo no contiene JSON válido.');}
    if(!obj(backup)||backup.format!=='finora-backup'||backup.version!==1)throw Error('Formato o versión de respaldo no compatible.');
    if(!obj(backup.data)||Object.keys(backup.data).length!==KEYS.length||!KEYS.every(k=>Object.hasOwn(backup.data,k))||Object.keys(backup.data).some(k=>!KEYS.includes(k)))throw Error('El respaldo está incompleto o contiene claves desconocidas.');
    if(KEYS.every(k=>backup.data[k]===null))throw Error('El respaldo está vacío.');
    for(const key of KEYS)validateRaw(key,backup.data[key]);return backup.data;
  }
  function restore(storage,data,original){
    data=parse(JSON.stringify({format:'finora-backup',version:1,data}));
    if(original&&JSON.stringify(snapshot(storage))!==JSON.stringify(original))throw Error('Los datos locales cambiaron desde la revisión. Vuelve a seleccionar el archivo.');
    const before=snapshot(storage),changed=[];
    try{for(const key of KEYS){if(data[key]===before[key])continue;if(data[key]===null)storage.removeItem(key);else storage.setItem(key,data[key]);changed.push(key);}}
    catch(_){let failed=false;for(const key of changed.reverse())try{if(before[key]===null)storage.removeItem(key);else storage.setItem(key,before[key]);}catch(_){failed=true;}throw Error(failed?'Falló la importación y no se pudo restaurar todo el estado anterior. Conserva tus respaldos y revisa el almacenamiento.':'No se pudo importar; se conservaron los datos anteriores.');}
  }
  const api={KEYS,snapshot,exportData,parse,restore};if(node)module.exports=api;else root.FinoraBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);

