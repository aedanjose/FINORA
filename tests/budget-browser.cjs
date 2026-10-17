'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.FINORA_PLAYWRIGHT || 'playwright');
const XLSX = require('../assets/vendor/sheetjs/xlsx.full.min.js');
const B = require('../assets/js/budget.js');
const I = require('../assets/js/budget-import.js');
const base = process.env.FINORA_BASE_URL || 'http://127.0.0.1:4173';
const route = '/modulos/planeacion-presupuestos/index.html';
const fields = Object.keys(B.fields);
const rows = [80,100,120].map((units, index) => ({month:`2026-${10+index}`, ...Object.fromEntries(fields.map(k => [k,0])), units, price:500, unitCost:280}));
function file() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([Object.values(I.labels), ...rows.map(row => Object.keys(I.labels).map(k => row[k]))]), 'Previsiones');
  XLSX.utils.book_append_sheet(wb, {'!ref':'A1:B6000',A1:{t:'s',v:'Mes'},B1:{t:'s',v:'Unidades'},A6000:{t:'s',v:'2026-10'},B6000:{t:'n',v:1}}, 'Fuera de límite');
  return {name:'presupuesto.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))};
}
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.FINORA_BROWSER_PATH ? {executablePath:process.env.FINORA_BROWSER_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = [], remote = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    page.on('pageerror', e => errors.push(e.message));
    context.on('request', r => {if(!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))remote.push(r.url());});
    page.on('dialog', d => d.accept());
    const model = () => page.evaluate(() => FinoraCasos.store.active());
    const analysis = () => page.evaluate(() => FinoraBudget.analyze(FinoraCasos.store.active()));
    const fill = async (path, v) => page.locator(`[data-path="${path}"]`).fill(String(v));
    await page.goto(base + route);
    await page.evaluate(() => FinoraCasos.store.create('Empresa real de prueba'));
    assert.equal(await page.locator('.budget-status').getAttribute('data-state'), 'incomplete');
    assert.equal(await page.locator('[data-path="months.0.price"]').inputValue(), '');
    await page.selectOption('#budget-opening-source','manual');
    const opening = Object.fromEntries(Object.keys(B.openingFields).map(k => [k,0]));
    Object.assign(opening,{cash:10000,inventory:5040,equity:15040});
    for(const [k,v] of Object.entries(opening)) await fill('opening.'+k,v);
    for(const [k,v] of Object.entries({inventoryUnits:18,inventoryPercent:20,nextUnits:140,collectionPercent:60,paymentPercent:50})) await fill(k,v);
    for(let index=0;index<rows.length;index++) {
      if(index) await page.click('#budget-add-month');
      for(const [k,v] of Object.entries(rows[index])) await fill(`months.${index}.${k}`,v);
    }
    await page.check('#budget-confirm'); await page.click('button[type=submit]');
    assert.match(await page.locator('#budget-save-state').innerText(),/guardado/);
    const saved = await model(); let r = await analysis();
    assert.equal(r.ready,true);assert.equal(r.totals.netProfit,66000);assert.equal(r.closing.cash,66560);
    await page.reload(); assert.deepEqual(await model(),saved);
    assert.equal(await page.locator('[data-path="months.2.units"]').inputValue(),'120');
    console.log('ok ingreso manual, cálculos, guardado y recarga');

    await page.click('#budget-import'); await page.setInputFiles('#budget-file',file());
    await page.click('#budget-import-review');
    assert.match(await page.locator('#budget-file-preview').innerText(),/3 meses/);
    await page.selectOption('#budget-file-sheet','Fuera de límite');
    await page.waitForFunction(() => document.getElementById('budget-file-error').textContent.includes('5,000'));
    await page.click('#budget-import-review');assert.match(await page.locator('#budget-file-error').innerText(),/hoja válida/);
    assert.equal(await page.isDisabled('#budget-import-apply'),true);
    await page.selectOption('#budget-file-sheet','Previsiones');await page.click('#budget-import-review');
    await page.click('#budget-import-cancel');assert.deepEqual(await model(),saved);
    await page.click('#budget-import'); await page.setInputFiles('#budget-file',file()); await page.click('#budget-import-review'); await page.click('#budget-import-apply');
    assert.deepEqual(await model(),saved,'Aplicar al formulario todavía no guarda');
    assert.equal(await page.isChecked('#budget-confirm'),false);
    await fill('months.0.units',81); await page.check('#budget-confirm'); await page.click('button[type=submit]');
    assert.equal((await analysis()).rows[0].purchaseUnits,83);
    assert.deepEqual((await model()).balance,saved.balance);assert.deepEqual((await model()).income,saved.income);
    console.log('ok Excel, revisión, cancelación, ajustes manuales y preservación de cuentas');

    await page.click('#budget-import');
    await page.setInputFiles('#budget-file',{name:'invalido.csv',mimeType:'text/csv',buffer:Buffer.from('Mes;Unidades;Precio\n2026-10;ilegible;500')});
    await page.click('#budget-import-review'); assert.match(await page.locator('#budget-file-error').innerText(),/inválido/);
    assert.equal(await page.isDisabled('#budget-import-apply'),true);
    await page.setInputFiles('#budget-file',{name:'valido.csv',mimeType:'text/csv',buffer:Buffer.from('Mes;Unidades;Precio\n2026-10;0;500')});
    await page.click('#budget-import-review');assert.equal(await page.isDisabled('#budget-import-apply'),false);
    await page.click('#budget-import-cancel');
    console.log('ok CSV, error recuperable y ceros');

    const proforma = await context.newPage(); await proforma.goto(base+'/modulos/proforma/index.html');
    assert.match(await proforma.locator('#income-proforma-body').innerText(),/150,500.00/);
    assert.doesNotMatch(await proforma.locator('#paper-badge-status').innerText(),/INCOMPLETO|EJEMPLO/);
    await proforma.click('#tab-balance');assert.equal(await proforma.locator('#report-balance').isVisible(),true);
    await proforma.locator('#tab-balance').press('Home');assert.equal(await proforma.locator('#report-income').isVisible(),true);
    await fill('months.0.units',80);await page.click('button[type=submit]');
    await proforma.waitForFunction(() => document.getElementById('income-proforma-body').textContent.includes('150,000.00'));
    await proforma.emulateMedia({media:'print'});assert.match(await proforma.locator('#paper-period').innerText(),/2026-10 a 2026-12/);await proforma.emulateMedia({media:'screen'});
    console.log('ok proforma, teclado, impresión y sincronización entre pestañas');

    // Un guardado de otra pestaña no debe ser sobrescrito por un borrador viejo.
    await fill('months.0.price',510);
    await proforma.evaluate(() => {const c=FinoraCasos.store.active();c.name='Empresa actualizada';FinoraCasos.store.save(c);});
    await page.waitForFunction(() => document.getElementById('budget-notice').textContent.includes('otra vista'));
    await page.click('button[type=submit]');assert.match(await page.locator('#budget-save-error').innerText(),/otra vista/);
    await page.click('#budget-reload');assert.equal(await page.locator('[data-path="months.0.price"]').inputValue(),'500');

    const first = await model();
    await page.evaluate(() => FinoraCasos.store.create('Segunda empresa'));
    assert.equal(await page.locator('[data-path="months.0.units"]').inputValue(),'');
    await proforma.waitForFunction(() => document.getElementById('paper-company').textContent === 'SEGUNDA EMPRESA');
    assert.match(await proforma.locator('#paper-badge-status').innerText(),/INCOMPLETO/);assert.equal(await proforma.locator('#proforma-net-margin').innerText(),'—');
    await page.selectOption('#case-select',first.id);
    assert.equal(await page.locator('[data-path="months.0.units"]').inputValue(),'80');
    console.log('ok aislamiento por empresa, faltantes y protección de cambios concurrentes');

    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({path:'.reference/budget-desktop.png',fullPage:true});
    for(const p of [page,proforma]) {
      await p.setViewportSize({width:390,height:844});
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const width = await p.evaluate(() => ({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(width.scroll <= width.viewport+1,p.url()+JSON.stringify(width));
    }
    await page.screenshot({path:'.reference/budget-mobile.png',fullPage:true});
    await proforma.screenshot({path:'.reference/budget-proforma.png',fullPage:true});

    await page.evaluate(() => {const c=FinoraCasos.store.active();c.balance=Finance.accountsFromBalances({current:c.params.budget.opening});FinoraCasos.store.save(c);});
    await page.selectOption('#budget-opening-source','automatic');
    assert.equal(await page.locator('[data-path="opening.cash"]').inputValue(),'10000');
    assert.equal(await page.locator('[data-path="opening.cash"]').getAttribute('readonly'),'');
    await page.check('#budget-confirm');await page.click('button[type=submit]');
    assert.equal((await analysis()).ready,true);
    await page.evaluate(() => {const c=FinoraCasos.store.active();c.currency='USD';FinoraCasos.store.save(c);});
    assert.equal((await analysis()).stale,true);assert.equal(await page.locator('[data-path="months.0.units"]').inputValue(),'');
    await page.click('button[type=submit]');
    assert.equal((await model()).params.budgetArchive.length,1);
    assert.equal((await model()).params.budgetArchive[0].months[0].units,80);
    console.log('ok saldos automáticos, confirmación y archivo del presupuesto al cambiar de contexto');
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    console.log('ok vista móvil, sin errores JavaScript ni peticiones externas');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
