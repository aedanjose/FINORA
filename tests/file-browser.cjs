'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.FINORA_PLAYWRIGHT||'playwright');
const XLSX=require('../assets/vendor/sheetjs/xlsx.full.min.js');
const base=process.env.FINORA_BASE_URL||'http://127.0.0.1:4173';
const balance=[['PRUEBA S.A.'],['Balance general · C$'],['Cuenta',2025,2024],['Activos circulantes',null,null],['Caja y bancos',200,100],['Total activos',200,100],['Capital',null,null],['Capital social',200,100],['Total pasivo y capital',200,100]];
const income=[['Cuenta',2025,2024],['Ventas',2000,1000],['Costo de ventas',800,400],['Gastos operativos totales',200,100],['Gastos por intereses',0,0],['Impuestos',0,0],['Utilidad neta',1000,500]];
function makeBook() {const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([]),'Vacía');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(balance),'Balance');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(income),'Resultados');return{name:'prueba-invertida.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))};}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FINORA_BROWSER_PATH?{executablePath:process.env.FINORA_BROWSER_PATH}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))remote.push(r.url());});
  const model=()=>page.evaluate(()=>FinoraCasos.store.active());
  const lists=()=>page.evaluate(()=>FinoraCasos.store.list());
  const file=makeBook();
  await page.goto(base+'/modulos/estados-financieros/index.html');await page.waitForSelector('#start-upload');
  const before=await lists();
  await page.click('#start-upload');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-sheet');
  // La primera hoja está vacía; la selección puede cambiar sin guardar ni perder el libro.
  await page.selectOption('#file-sheet','Balance');await page.waitForSelector('#file-review');
  assert.equal(await page.inputValue('#file-previous-year'),'2024');assert.equal(await page.inputValue('#file-current-year'),'2025');
  assert.equal(await page.inputValue('#file-previous'),'2');assert.equal(await page.inputValue('#file-current'),'1');
  assert.deepEqual(await lists(),before);
  if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');await page.waitForSelector('#import-summary');
  assert.equal(await page.inputValue('[data-import-side="previous"] >> nth=0'),'100');
  assert.equal(await page.inputValue('[data-import-side="current"] >> nth=0'),'200');
  assert.match(await page.locator('#import-workspace').innerText(),/prueba-invertida.xlsx/);
  await page.click('[data-import-action="cancel"]');assert.deepEqual(await lists(),before,'Cancelar no crea casos');assert.equal(await page.locator('#start-panel').isVisible(),true);
  console.log('ok carga inicial, hojas, años invertidos y cancelación');
  await page.click('#start-upload');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-sheet');await page.selectOption('#file-sheet','Balance');await page.waitForSelector('#file-review');if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');await page.waitForSelector('#import-summary');
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),false);
  await page.click('[data-import-action="apply"]');await page.waitForSelector('#upload-excel');
  assert.equal(await page.locator('#start-panel').isVisible(),false);assert.equal((await model()).balance[0].amounts.current,200);
  assert.equal((await model()).name,'PRUEBA S.A.');assert.equal(await page.evaluate(()=>FinoraCasos.analyzeBalance(FinoraCasos.store.active()).balanced.current),true);
  assert.equal((await lists()).length,before.length+1);const saved=await model();
  await page.reload();await page.waitForSelector('#upload-excel');assert.deepEqual(await model(),saved);
  console.log('ok aplicar archivo, nuevo caso y guardado');

  await page.click('#tab-income');await page.click('#upload-excel');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-review');
  assert.equal(await page.inputValue('#file-sheet'),'Resultados');
  if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');await page.waitForSelector('#import-summary');
  assert.deepEqual(await model(),saved,'Revisión de resultados no cambia balance');
  const confirm=page.locator('[data-edit="confirmed"]');for(let i=0;i<await confirm.count();i++)await confirm.nth(i).check();
  await page.click('[data-import-action="apply"]');await page.waitForSelector('.detail-dialog',{state:'hidden'});
  assert.deepEqual((await model()).balance,saved.balance);assert.equal(await page.evaluate(()=>FinoraCasos.analyzeIncome(FinoraCasos.store.active()).statements.current.netProfit),1000);
  console.log('ok selección de resultados, clasificación y preservación del balance');

  await page.click('#tab-balance');await page.click('#upload-excel');
  const csv={name:'tres-anios.csv',mimeType:'text/csv',buffer:Buffer.from('Cuenta;2025;2023;2024\nActivos circulantes;;;\nCaja;300;100;200\nCapital;;;\nCapital social;300;100;200')};
  await page.setInputFiles('#financial-file',csv);await page.waitForSelector('#file-review');
  assert.equal(await page.inputValue('#file-previous-year'),'2024');assert.equal(await page.inputValue('#file-current-year'),'2025');
  await page.selectOption('#file-previous','2');assert.equal(await page.inputValue('#file-previous-year'),'2023');
  if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');await page.waitForSelector('#import-summary');
  assert.doesNotMatch(await page.locator('#import-errors').innerText(),/años no coinciden/);assert.equal(await page.locator('#import-period-notice').isVisible(),true);
  const csvConfirm=page.locator('[data-edit="confirmed"]');for(let i=0;i<await csvConfirm.count();i++)await csvConfirm.nth(i).check();
  assert.equal(await page.locator('[data-import-action="apply"]').isDisabled(),false);
  await page.click('[data-import-action="cancel"]');
  console.log('ok CSV de tres años y protección de períodos existentes');

  await page.click('#upload-excel');
  await page.setInputFiles('#financial-file',{name:'sin-anios.csv',mimeType:'text/csv',buffer:Buffer.from('Cuenta;Anterior;Actual\nCaja;100;200\nCapital social;100;200')});await page.waitForSelector('#file-review');
  await page.fill('#file-previous-year','2024');await page.fill('#file-current-year','2025');if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');assert.match(await page.locator('#file-error').innerText(),/Confirma/);
  await page.check('#file-confirm-columns');if(await page.locator('#file-both').count()) await page.uncheck('#file-both');await page.click('#file-review');await page.waitForSelector('#import-summary');await page.click('[data-import-action="cancel"]');
  console.log('ok columnas sin años requieren confirmación');

  await page.click('#upload-excel');await page.setInputFiles('#financial-file',{name:'danado.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('archivo inválido')});
  await page.waitForFunction(()=>document.querySelector('#file-error').textContent.includes('válido'));
  assert.equal(await page.locator('#file-review').count(),0);
  // Se puede elegir otro archivo en la misma ventana después de un error.
  await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-review');await page.selectOption('#file-sheet','Vacía');await page.waitForFunction(()=>document.querySelector('#file-error').textContent.includes('vacía'));
  await page.selectOption('#file-sheet','Balance');await page.waitForSelector('#file-review');
  await page.screenshot({path:'.reference/file-columns-dark.png'});
  await page.click('[data-file-cancel]');
  await page.click('.presentation-toggle');await page.click('#upload-excel');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-review');await page.screenshot({path:'.reference/file-columns-light.png'});await page.click('[data-file-cancel]');
  await page.click('.presentation-toggle');await page.setViewportSize({width:390,height:844});await page.click('#upload-excel');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-review');
  assert.ok(await page.evaluate(()=>document.querySelector('.detail-dialog').scrollWidth<=document.querySelector('.detail-dialog').clientWidth+1),'Diálogo sin desborde');
  await page.screenshot({path:'.reference/file-columns-mobile.png'});await page.click('[data-file-cancel]');
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[],'Sin peticiones externas');
  console.log('ok errores recuperables, modo claro/oscuro, móvil y lectura sin servicios externos');
  await page.click('#paste-excel');await page.click('[data-import-action="file"]');await page.waitForSelector('#financial-file');await page.setInputFiles('#financial-file',file);await page.waitForSelector('#file-review');await page.click('[data-file-cancel]');
  const local=await context.newPage();const localErrors=[];local.on('pageerror',e=>localErrors.push(e.message));
  await local.goto(require('node:url').pathToFileURL(require('node:path').resolve('modulos/estados-financieros/index.html')).href);
  await local.waitForSelector('#start-upload');await local.click('#start-upload');await local.setInputFiles('#financial-file',file);await local.waitForSelector('#file-sheet');await local.selectOption('#file-sheet','Balance');await local.waitForSelector('#file-review');
  assert.equal(await local.inputValue('#file-previous-year'),'2024');assert.ok(await local.evaluate(()=>!!window.XLSX));
  await local.click('#file-review');await local.waitForSelector('#import-summary');await local.click('[data-import-action="cancel"]');assert.deepEqual(localErrors,[]);await local.close();
  console.log('ok acceso desde Pegar y apertura directa del HTML sin servidor');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
