'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.FINORA_PLAYWRIGHT||'playwright');
const XLSX=require('../assets/vendor/sheetjs/xlsx.full.min.js');
const base=process.env.FINORA_BASE_URL||'http://127.0.0.1:4173';
function fixture(){
 if(process.env.FINORA_TEST_WORKBOOK) return fs.readFileSync(process.env.FINORA_TEST_WORKBOOK);
 const wb=XLSX.utils.book_new();
 for(const [name,kind] of [['Balance General','balance'],['Estado de Resultados','income']]){
  const rows=fs.readFileSync(path.join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t').map(c=>c===''?null:/^-?\d+(?:\.\d+)?$/.test(c)?+c:c));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
 }
 return Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.FINORA_BROWSER_PATH});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('finora:casos:v1')));
  const active=()=>page.evaluate(()=>FinoraCasos.store.active());
  await page.goto(base+'/modulos/estados-financieros/index.html');await page.click('[data-start-sample="dayton"]');
  const initial=await state();
  const upload=async()=>{await page.click('#upload-excel');await page.setInputFiles('#financial-file',{name:'Estados_Financieros_Prueba_2025_2026.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:fixture()});await page.waitForSelector('#file-review');assert.equal(await page.isChecked('#file-both'),true);await page.click('#file-review');await page.waitForSelector('#import-summary');};
  await upload();assert.match(await page.locator('.import-kicker').innerText(),/1 de 2/i);assert.match(await page.locator('#import-check-count').innerText(),/18\/18/);
  await page.locator('.import-account-name').first().fill('Efectivo revisado');await page.click('[data-import-action="apply"]');
  await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));
  assert.deepEqual(await state(),initial);assert.match(await page.locator('#import-check-count').innerText(),/8\/8/);
  await page.locator('.import-account-name').first().fill('Ventas revisadas');await page.click('[data-import-action="back"]');
  await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('1 de 2'));
  assert.equal(await page.locator('.import-account-name').first().inputValue(),'Efectivo revisado');
  await page.click('[data-import-action="apply"]');await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));
  assert.equal(await page.locator('.import-account-name').first().inputValue(),'Ventas revisadas');
  await page.click('[data-import-action="cancel"]');assert.deepEqual(await state(),initial);
  console.log('ok cancelar en resultados no guarda; volver conserva revisiones de ambas hojas');
  await upload();await page.click('[data-import-action="apply"]');await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));
  await page.fill('#import-current','2027');assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),true);assert.match(await page.locator('#import-errors').innerText(),/mismos años/);
  await page.fill('#import-current','2026');await page.screenshot({path:'.reference/joint-income-ready.png'});
  await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  const saved=await active();assert.equal(saved.balance.length,11);assert.equal(saved.income.length,6);assert.equal(saved.name,'Estados_Financieros_Prueba_2025_2026');
  const totals=await page.evaluate(()=>({balance:FinoraCasos.analyzeBalance(FinoraCasos.store.active()),income:FinoraCasos.analyzeIncome(FinoraCasos.store.active())}));
  assert.equal(totals.balance.totals.assets.current,535000);assert.equal(totals.balance.totals.liabilities.current,260000);assert.equal(totals.balance.totals.equity.current,275000);assert.equal(totals.balance.balanced.current,true);assert.equal(totals.income.statements.current.netProfit,75000);
  const stored=await state();assert.deepEqual(stored.cases.find(c=>c.id===initial.activeId),initial.cases.find(c=>c.id===initial.activeId));assert.equal(stored.cases.length,initial.cases.length+1);
  console.log('ok archivo real: 11 cuentas de balance, 6 de resultados, activos 535000 y utilidad 75000');
  await page.reload();await page.waitForSelector('#upload-excel');assert.deepEqual(await active(),saved);
  // Reproduce la situación reportada: documento que sólo tiene los resultados.
  await page.evaluate(()=>{const c=FinoraCasos.store.active();c.balance=[];c.name='Ejemplo ficticio · Moneda: córdobas nicaragüenses (C$)';FinoraCasos.store.save(c);});
  const count=(await state()).cases.length;
  await upload();await page.click('[data-import-action="apply"]');await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));
  await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  assert.equal((await active()).id,saved.id);assert.equal((await active()).balance.length,11);assert.equal((await state()).cases.length,count);assert.equal((await active()).name,saved.name);
  console.log('ok reimportar completa el balance faltante en el mismo documento, sin duplicarlo');
  // Una cuenta desconocida en la segunda hoja sigue necesitando revisión.
  const wb=XLSX.read(fixture(),{type:'buffer'}),name=wb.SheetNames.find(n=>/resultados/i.test(n));
  for(const [address,cell]of Object.entries(wb.Sheets[name])) if(cell.v==='Ventas netas') wb.Sheets[name][address]={t:'s',v:'Ingreso personalizado'};
  await page.click('#upload-excel');await page.setInputFiles('#financial-file',{name:'revision.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))});await page.waitForSelector('#file-review');await page.click('#file-review');await page.waitForSelector('#import-summary');await page.click('[data-import-action="apply"]');await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),true);const row=page.locator('[data-import-row]').first();await row.locator('.import-classification summary').click();await row.locator('[data-edit="category"]').selectOption('sales');await row.locator('[data-edit="confirmed"]').check();assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),false);
  await page.evaluate(()=>{const c=FinoraCasos.store.active();c.name='Modificado durante revisión';FinoraCasos.store.save(c);});await page.click('[data-import-action="apply"]');assert.match(await page.locator('#import-errors').innerText(),/cambió/);await page.click('[data-import-action="cancel"]');
  // Hojas con nombres genéricos y columnas invertidas en sólo uno de los estados.
  const generic=XLSX.utils.book_new(), source=XLSX.read(fixture(),{type:'buffer'});
  for(const [kind,name] of [['balance','Hoja1'],['income','Hoja2']]) {
    const originalName=source.SheetNames.find(n=>kind==='balance'?/balance/i.test(n):/resultados/i.test(n));
    const rows=XLSX.utils.sheet_to_json(source.Sheets[originalName],{header:1,defval:null,raw:true});
    if(kind==='income') for(const row of rows) if(row.length>=3) [row[1],row[2]]=[row[2],row[1]];
    XLSX.utils.book_append_sheet(generic,XLSX.utils.aoa_to_sheet(rows),name);
  }
  await page.click('#upload-excel');await page.setInputFiles('#financial-file',{name:'generico.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(generic,{type:'buffer',bookType:'xlsx'}))});await page.waitForSelector('#file-review');assert.equal(await page.isChecked('#file-both'),true);
  await page.selectOption('#file-sheet','Hoja2');await page.waitForFunction(()=>document.querySelector('#file-current')?.value==='1');assert.equal(await page.inputValue('#file-previous'),'2');
  await page.click('#file-review');await page.waitForSelector('#import-summary');await page.click('[data-import-action="apply"]');await page.waitForFunction(()=>document.querySelector('.import-kicker')?.textContent.includes('2 de 2'));await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  assert.deepEqual((await active()).income[0].amounts,{previous:600000,current:700000});assert.equal((await active()).balance[0].amounts.current,100000);
  console.log('ok detección por contenido y columnas invertidas con distintos órdenes en ambas hojas');
  assert.deepEqual(errors,[]);console.log('ok revisión de cuentas desconocidas y protección ante cambios durante la revisión');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
