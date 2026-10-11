'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),XLSX=require('../assets/vendor/sheetjs/xlsx.full.min.js');
const {chromium}=require(process.env.FINORA_PLAYWRIGHT||'playwright');
const base=process.env.FINORA_BASE_URL||'http://127.0.0.1:4173';
const input=process.env.FINORA_TEST_WORKBOOK;
const filename='Estados_Financieros_Prueba_2025_2026.xlsx';
function file(){
 if(input)return {name:filename,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:fs.readFileSync(input)};
 const wb=XLSX.utils.book_new();for(const [sheet,kind]of [['Balance General','balance'],['Estado de Resultados','income']]){const text=fs.readFileSync(require('node:path').join(__dirname,'fixtures',`prueba-2025-2026-${kind}.txt`),'utf8');const rows=text.split(/\r?\n/).filter(Boolean).map(l=>l.split('\t').map(c=>c===''?null:/^-?\d+(?:\.\d+)?$/.test(c)?Number(c):c));XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),sheet);}return {name:filename,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))};
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FINORA_BROWSER_PATH?{executablePath:process.env.FINORA_BROWSER_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const model=()=>page.evaluate(()=>FinoraCasos.store.active());
  await page.goto(base+'/modulos/estados-financieros/index.html');await page.waitForSelector('[data-start-sample="dayton"]');await page.click('[data-start-sample="dayton"]');
  const original=await model(),listBefore=await page.evaluate(()=>FinoraCasos.store.list());
  const importSheet=async(kind)=>{await page.click('#tab-'+kind);await page.click('#upload-excel');await page.setInputFiles('#financial-file',file());await page.waitForSelector('#file-review');await page.click('#file-review');await page.waitForSelector('#import-summary');};
  await importSheet('balance');
  assert.doesNotMatch(await page.locator('#import-errors').innerText(),/años no coinciden/);
  assert.equal(await page.locator('#import-period-notice').isVisible(),true);
  assert.equal(await page.locator('[data-import-action="new-document"]').count(),0);
  assert.equal(await page.locator('[data-edit="confirmed"]').count(),0);assert.match(await page.locator('#import-check-count').innerText(),/18\/18/);
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),false);
  await page.locator('#import-period-notice').scrollIntoViewIfNeeded();await page.screenshot({path:'.reference/attached-period-conflict.png'});
  const classification=page.locator('.import-classification').first();await classification.locator('summary').click();await classification.locator('[data-edit="role"]').selectOption('cash');
  assert.deepEqual(await model(),original);await page.click('[data-import-action="cancel"]');assert.deepEqual(await page.evaluate(()=>FinoraCasos.store.list()),listBefore);
  console.log('ok años distintos permiten clasificar; cancelar no crea casos ni cambia el documento anterior');
  await importSheet('balance');await page.locator('.import-account-name').first().fill('Efectivo y bancos revisado');
  assert.equal(await page.locator('.import-account-name').first().inputValue(),'Efectivo y bancos revisado');
  await page.locator('[data-import-action="apply"]').scrollIntoViewIfNeeded();await page.screenshot({path:'.reference/attached-balance-ready.png'});
  await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  const current=await model();assert.notEqual(current.id,original.id);assert.equal(current.balance.length,11);assert.equal(current.currency,'C$');assert.equal(current.scale,'');assert.deepEqual(current.periods,{previous:'2025',current:'2026'});assert.equal(current.balance[0].name,'Efectivo y bancos revisado');
  const storedOld=await page.evaluate(id=>JSON.parse(localStorage.getItem('finora:casos:v1')).cases.find(c=>c.id===id),original.id);assert.deepEqual(storedOld,original);
  const summary=await page.evaluate(()=>FinoraCasos.analyzeBalance(FinoraCasos.store.active()));assert.equal(summary.balanced.previous,true);assert.equal(summary.balanced.current,true);assert.equal(summary.totals.assets.current,535000);assert.equal(summary.totals.liabilities.current,260000);assert.equal(summary.totals.equity.current,275000);
  console.log('ok aplicación del balance 2025-2026, conservación de revisiones y del caso anterior');
  await importSheet('income');assert.equal(await page.locator('[data-edit="confirmed"]').count(),0);assert.match(await page.locator('#import-check-count').innerText(),/8\/8/);assert.equal(await page.locator('[data-import-action="new-document"]').count(),0);
  await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  assert.deepEqual((await model()).balance,current.balance);assert.equal((await model()).income.length,6);
  assert.equal(await page.evaluate(()=>FinoraCasos.analyzeIncome(FinoraCasos.store.active()).statements.current.netProfit),75000);
  assert.equal(await page.evaluate(()=>FinoraCasos.checks(FinoraCasos.store.active()).items.filter(i=>i.ok===false).length),0);
  await page.reload();await page.waitForSelector('#tab-income');assert.equal((await model()).id,current.id);assert.equal((await model()).income.length,6);assert.deepEqual(errors,[]);
  console.log('ok estado de resultados del mismo archivo, comprobaciones y guardado al recargar');
  const saved=await model(),count=await page.evaluate(()=>FinoraCasos.store.list().length);
  await page.evaluate(()=>FinoraImport.open({kind:'balance',text:'Cuenta\t2026\t2027\nCuenta personalizada\t100\t200\nCapital social\t100\t200'}));
  await page.waitForSelector('#import-summary');assert.equal(await page.locator('#import-period-notice').isVisible(),true);assert.doesNotMatch(await page.locator('#import-errors').innerText(),/años no coinciden/);
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),true);
  const unknown=page.locator('[data-import-row]').first();await unknown.locator('.import-classification summary').click();await unknown.locator('[data-edit="block"]').selectOption('0');await unknown.locator('[data-edit="role"]').selectOption('cash');await unknown.locator('[data-edit="confirmed"]').check();
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),false);assert.deepEqual(await model(),saved);await page.click('[data-import-action="cancel"]');assert.equal(await page.evaluate(()=>FinoraCasos.store.list().length),count);
  console.log('ok cuenta desconocida de otros años se puede clasificar y confirmar');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
