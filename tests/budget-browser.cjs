'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.FINORA_PLAYWRIGHT||'playwright');
const XLSX=require('../assets/vendor/sheetjs/xlsx.full.min.js'),ref=require('./fixtures/buen-precio.json'),B=require('../assets/js/budget.js');
const base=process.env.FINORA_BASE_URL||'http://127.0.0.1:4173',route='/modulos/planeacion-presupuestos/index.html';
function file(){
  if(process.env.FINORA_BUDGET_WORKBOOK)return process.env.FINORA_BUDGET_WORKBOOK;
  const wb=XLSX.utils.book_new();for(const [name,s] of Object.entries(ref.sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s.values),name);
  return {name:'buen-precio.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))};
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.FINORA_BROWSER_PATH?{executablePath:process.env.FINORA_BROWSER_PATH}:{})});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],remote=[];
    context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
    context.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const fill=async(path,value)=>page.locator(`[data-path="${path}"]`).fill(String(value));
    const select=async(path,value)=>page.locator(`[data-path="${path}"]`).selectOption(value);
    const step=async n=>page.click(`[data-step="${n}"]`),save=async()=>page.click('[data-action="save"]');
    const model=()=>page.evaluate(()=>FinoraCasos.store.active()),analysis=()=>page.evaluate(()=>FinoraBudget.analyze(FinoraCasos.store.active()));
    await page.goto(base+route);await page.evaluate(()=>FinoraCasos.store.create('Empresa real de prueba'));
    assert.equal(await page.locator('[data-path="config.start"]').inputValue(),'');assert.equal(await page.locator('[data-path="advanced.opening.cash"]').count(),0);
    await fill('name','Octubre a diciembre');await fill('config.start','2026-10-01');await page.locator('[data-path="config.start"]').press('Tab');await step(1);
    for(let i=0;i<3;i++){await fill(`products.0.values.2026-${10+i}.units`,150+30*i);await fill(`products.0.values.2026-${10+i}.price`,650);}
    await save();let r=await analysis();assert.equal(r.stages.sales.ready,true);assert.equal(r.totals.sales,351000);assert.equal(r.stages.purchases.ready,false);assert.equal(r.stages.income.ready,false);
    console.log('ok ventas manuales sin balance, gastos ni impuestos');

    const before=await model();
    async function review(){await page.click('[data-action="import"]');await page.setInputFiles('#budget-file',file());await page.selectOption('#budget-file-mode','academic');await page.selectOption('#budget-file-sheet','Datos');await page.click('#budget-import-review');}
    await review();assert.match(await page.locator('#budget-file-preview').innerText(),/60,900/);await page.click('#budget-import-cancel');assert.deepEqual(await model(),before);
    await review();await page.click('#budget-import-apply');assert.deepEqual(await model(),before);await save();r=await analysis();assert.equal(r.totals.sales,351000);assert.equal(r.totals.purchases,214700);assert.equal(r.totals.costSales,205200);assert.equal(r.totals.netProfit,60900);assert.equal(r.stages.income.ready,true);
    const reference=await model(),monthlyId=reference.params.budget.id;await page.reload();await step(2);assert.equal(await page.locator('[data-path="products.0.initialUnits"]').inputValue(),'35');
    await step(3);assert.match(await page.locator('[data-output="products.0.rows.0.openingValue"]').innerText(),/13,300/);
    await step(4);assert.equal(await page.locator('[data-path="expenses.4.category"]').inputValue(),'depreciation');await step(5);assert.match(await page.locator('[data-output="totals.netProfit"]').innerText(),/60,900/);
    assert.deepEqual((await model()).balance,before.balance);assert.deepEqual((await model()).income,before.income);
    console.log('ok Excel real, revisión, cancelar, aplicar, persistir, costos y depreciación');

    const proforma=await context.newPage();await proforma.goto(base+'/modulos/proforma/index.html');assert.match(await proforma.locator('#income-proforma-body').innerText(),/60,900.00/);assert.doesNotMatch(await proforma.locator('#paper-badge-status').innerText(),/INCOMPLETO/);
    await proforma.click('#tab-balance');assert.match(await proforma.locator('#paper-badge-status').innerText(),/SIN ACTIVAR/);await proforma.locator('#tab-balance').press('Home');assert.match(await proforma.locator('#paper-badge-status').innerText(),/PRESUPUESTADA/);
    await step(1);await fill('products.0.values.2026-10.price',660);await save();await proforma.waitForFunction(()=>document.getElementById('income-proforma-body').textContent.includes('61,950.00'));
    await fill('products.0.values.2026-10.price',650);await save();
    console.log('ok Proforma comparte resultados, navegación por teclado y sincronización');

    await page.click('[data-action="copy"]');await fill('name','Plan anual');await step(0);await select('config.frequency','annual');await page.selectOption('#budget-duration','2');await page.click('[data-action="product"]');await fill('products.1.name','Segundo producto');await step(1);
    for(let i=0;i<2;i++)for(const year of ['2026','2027']){await fill(`products.${i}.values.${year}.units`,10);await fill(`products.${i}.values.${year}.price`,100+i*50);}
    await save();r=await analysis();assert.equal(r.rows.length,2);assert.equal(r.totals.sales,5000);assert.equal(r.products.length,2);assert.equal((await model()).params.budgetProjections.length,2);
    await step(0);await fill('config.count',1);await page.locator('[data-path="config.count"]').press('Tab');await fill('config.count',2);await page.locator('[data-path="config.count"]').press('Tab');await step(1);assert.equal(await page.locator('[data-path="products.0.values.2027.units"]').inputValue(),'10');await save();
    const options=await page.locator('#budget-projections option').evaluateAll(els=>els.map(e=>({value:e.value,text:e.textContent})));await page.selectOption('#budget-projections',options.find(o=>o.text.startsWith('Octubre a diciembre')).value);await save();assert.equal((await model()).params.budget.id,monthlyId);assert.equal((await analysis()).totals.netProfit,60900);
    console.log('ok múltiples productos, años, horizonte reversible y recuperación de proyecciones');

    await step(6);assert.equal(await page.locator('[data-path="advanced.opening.cash"]').count(),0);await page.check('[data-path="advanced.enabled"]');await select('advanced.openingSource','manual');await page.locator('summary').click();
    const opening=Object.fromEntries(Object.keys(B.openingFields).map(k=>[k,0]));Object.assign(opening,{cash:50000,inventory:13300,fixed:10000,equity:73300});
    for(const [k,v] of Object.entries(opening))await fill('advanced.opening.'+k,v);
    await fill('advanced.collectionPercent',100);await fill('advanced.paymentPercent',100);await page.check('[data-path="advanced.confirmed"]');await save();r=await analysis();assert.equal(r.ready,true);assert.equal(r.closing.difference,0);
    await proforma.click('#tab-balance');await proforma.waitForFunction(()=>!document.getElementById('paper-badge-status').textContent.includes('INCOMPLETO'));assert.match(await proforma.locator('#balance-equation-msg').innerText(),/Activos = pasivos/);
    console.log('ok caja avanzada y balance conciliado');

    const beforePersonal=await model(),inventory=await context.newPage();
    await inventory.goto(base+'/modulos/inventario/index.html');
    assert.equal(await inventory.locator('#summary-products').innerText(),'8');
    assert.equal(await inventory.locator('#case-bar').count(),0);
    assert.equal(await inventory.evaluate(()=>typeof window.FinoraBudget),'undefined');
    await inventory.fill('#inventory-search','Silla');
    assert.equal(await inventory.locator('#inventory-rows tr').count(),1);
    assert.deepEqual(await model(),beforePersonal);
    await step(0);assert.equal(await page.locator('#budget-inventory').count(),0);
    await step(2);assert.equal(await page.locator('#budget-inventory').count(),0);
    assert.equal(await page.locator('[data-path="products.0.initialUnits"]').inputValue(),'35');
    console.log('ok inventario complementario independiente y existencias propias del presupuesto');

    await step(1);await page.click('[data-action="import"]');await page.setInputFiles('#budget-file',{name:'invalido.csv',mimeType:'text/csv',buffer:Buffer.from('Producto;Período;Unidades;Precio unitario\nA;2026-10;ilegible;500')});await page.click('#budget-import-review');assert.match(await page.locator('#budget-file-error').innerText(),/inválido/);assert.equal(await page.isDisabled('#budget-import-apply'),true);
    await page.setInputFiles('#budget-file',{name:'valido.csv',mimeType:'text/csv',buffer:Buffer.from('Producto;Período;Unidades;Precio unitario\nA;2026-10;0;500')});await page.click('#budget-import-review');assert.equal(await page.isDisabled('#budget-import-apply'),false);await page.click('#budget-import-cancel');
    await fill('products.0.values.2026-10.price',700);await proforma.evaluate(()=>{const c=FinoraCasos.store.active();c.name='Empresa actualizada';FinoraCasos.store.save(c);});await page.waitForFunction(()=>document.getElementById('budget-notice').textContent.includes('otra vista'));await save();assert.match(await page.locator('#budget-save-error').innerText(),/otra vista/);await page.click('[data-action="reload"]');assert.equal(await page.locator('[data-path="products.0.values.2026-10.price"]').inputValue(),'650');
    const first=await model();await page.evaluate(()=>FinoraCasos.store.create('Segunda empresa'));await step(0);assert.equal(await page.locator('[data-path="config.start"]').inputValue(),'');assert.equal(await inventory.locator('#summary-products').innerText(),'8');await page.selectOption('#case-select',first.id);assert.equal((await analysis()).totals.netProfit,60900);
    console.log('ok CSV, ceros, conflictos entre pestañas y aislamiento por empresa');

    // Importar gastos de cuentas históricas sin sobrescribirlas ni duplicar fuentes.
    await page.evaluate(()=>{const c=FinoraCasos.store.active();c.income.push({id:'test-opex',name:'Gastos administrativos',category:'opex',sign:1,amounts:{current:12000,previous:10000}});FinoraCasos.store.save(c);});
    await page.click('[data-action="copy"]');await step(4);const count=await page.locator('[data-remove-expense]').count();await page.click('[data-action="history"]');assert.equal(await page.locator('[data-remove-expense]').count(),count+2); // Cuenta vacía original + cuenta informada.
    const imported=await page.locator('[data-remove-expense]').count();await page.click('[data-action="history"]');assert.equal(await page.locator('[data-remove-expense]').count(),imported);
    await select(`expenses.${imported-1}.mode`,'adjusted');await fill(`expenses.${imported-1}.adjustment`,10);assert.match(await page.locator(`[data-output="expenseRows.${imported-1}.amounts.2026-10"]`).innerText(),/1,100/);
    await page.click('[data-action="reload"]');
    console.log('ok gastos históricos ajustables y fuentes sin duplicar');

    await page.setViewportSize({width:390,height:844});await step(5);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:'.reference/budget-stages-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.reference/budget-stages-desktop.png',fullPage:true});await proforma.click('#tab-income');await proforma.screenshot({path:'.reference/budget-proforma.png',fullPage:true});
    await proforma.emulateMedia({media:'print'});assert.match(await proforma.locator('#paper-period').innerText(),/2026-10 a 2026-12/);await proforma.emulateMedia({media:'screen'});
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);console.log('ok vista móvil, impresión y ejecución sin errores ni conexiones externas');
    await context.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
