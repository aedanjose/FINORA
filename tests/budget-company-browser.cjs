'use strict';
// Prueba aislada con Edge/Chromium y CDP nativo de Node; no requiere Playwright.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const http = require('node:http'), os = require('node:os'), { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const executable = process.env.FINORA_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' }).end(data);
  });
});
async function run() {
  assert.ok(fs.existsSync(executable), 'Define FINORA_BROWSER_PATH con Edge o Chromium instalado.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-budget-company-'));
  const browser = spawn(executable, ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-features=msEdgeSidebarV2', '--user-data-dir=' + profile, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', stderr = '';
  const pending = new Map(), errors = [];
  browser.stderr.on('data', chunk => { stderr += chunk.toString(); });
  browser.stdio[4].on('data', chunk => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf('\0')) !== -1;) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.id && pending.has(message.id)) {
        const p = pending.get(message.id); pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP sin respuesta: ' + method + '\n' + stderr.slice(-1200))); }, 15000);
    pending.set(id, { resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const target = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const evaluateIn = async (session, expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const evaluate = expression => evaluateIn(sessionId, expression);
  const until = async expression => {
    const deadline = Date.now() + 10000;
    while (!await evaluate(expression)) { if (Date.now() > deadline) throw new Error('Condición pendiente: ' + expression); await new Promise(resolve => setTimeout(resolve, 100)); }
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Campo ausente');el.value=${JSON.stringify(String(value))};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const content = id => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const active = () => evaluate('FinoraCasos.store.active()');
  const screenshots = [];
  const shot = async (name, full = false) => {
    await evaluate('document.getElementById("toast")?.classList.remove("visible")');
    const size = full ? (await send('Page.getLayoutMetrics', {}, sessionId)).cssContentSize : null;
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(size ? { clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } } : {}) }, sessionId);
    const file = path.join(profile, name + '.png'); fs.writeFileSync(file, Buffer.from(result.data, 'base64')); screenshots.push(file);
  };
  const route='/modulos/planeacion-presupuestos/index.html';
  const navigate = async module => { await send('Page.navigate',{url:base+'/modulos/'+module+'/index.html'},sessionId); await until(`document.body?.dataset.page===${JSON.stringify(module)} && document.readyState==='complete' && !!document.getElementById('case-select')`); };
  const open = () => fill('#case-select','__new');
  const submit = () => evaluate('document.getElementById("budget-company-form").requestSubmit()');
  const cancel = async () => { await click('#budget-company-cancel'); await until('!document.querySelector("dialog").open'); };
  const field = (name,value) => fill(`[data-path="${name}"]`,value);
  const step = n => click(`[data-step="${n}"]`);
  const save = () => click('[data-action="save"]');
  const stored = () => evaluate('localStorage.getItem("finora:casos:v1")');
  const analysis = () => evaluate('FinoraBudget.analyze(FinoraCasos.store.active())');
  const upload = async (selector,file) => { const {root:doc}=await send('DOM.getDocument',{},sessionId); const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector},sessionId); await send('DOM.setFileInputFiles',{nodeId,files:[file]},sessionId); };
  try {
    await send('Runtime.enable',{},sessionId); await send('Page.enable',{},sessionId);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    await navigate('planeacion-presupuestos');
    await evaluate(`(()=>{const c=FinoraCasos.store.active(),p=FinoraBudget.newProjection(c);p.name='Presupuesto existente';p.config.start='2026-10-01';p.config.count=1;p.products[0].values['2026-10']={units:10,price:20};FinoraCasos.store.save(FinoraBudget.saveProjection(c,p));})()`);
    const existing=await active(), before=await stored();
    const ids=await evaluate('FinoraCasos.store.list().map(c=>c.id)');
    await field('name','Borrador conservado'); await step(3);
    await open(); assert.equal(await evaluate('location.pathname'),route);
    await fill('[name=companyName]','Cancelada'); await cancel();
    assert.equal(await stored(),before); assert.equal(await evaluate('document.querySelector("[data-path=name]").value'),'Borrador conservado');
    await open(); await fill('[name=companyName]',''); await submit();
    assert.equal(await evaluate('document.querySelector("[name=companyName]").validity.valueMissing'),true);
    await fill('[name=companyName]','   '); await submit(); assert.match(await content('budget-company-error'),/Escribe un nombre/);
    await fill('[name=companyName]','x'.repeat(81)); await submit(); assert.match(await content('budget-company-error'),/80 caracteres/);
    await fill('[name=companyName]','  '+existing.name.toUpperCase().replaceAll(' ','  ')+'  '); await submit(); assert.match(await content('budget-company-error'),/Ya existe/);
    assert.equal(await stored(),before);
    await fill('[name=companyName]','Comercial El Roble');
    for(const width of [1440,390]) for(const mode of ['off','on']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${mode}'`);
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth+1'));
      assert.ok(await evaluate('Array.from(document.querySelectorAll("#budget-company-form input,#budget-company-form button")).every(e=>e.getBoundingClientRect().right<=document.querySelector("dialog").getBoundingClientRect().right)'));
      if(mode==='off')await shot('nueva-empresa-'+width);
    }
    await evaluate('(()=>{const form=document.getElementById("budget-company-form");form.requestSubmit();form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));})()');
    const company=await active();
    assert.equal(company.name,'Comercial El Roble');assert.equal(company.currency,'C$');assert.equal(company.scale,'');
    assert.deepEqual(company.balance,[]);assert.deepEqual(company.income,[]);assert.deepEqual(company.reported,{});assert.deepEqual(company.params,{});
    assert.deepEqual(company.periods,{previous:'Anterior',current:'Actual'});assert.equal(company.statementDate,'');
    assert.equal(await evaluate('FinoraCasos.store.list().length'),ids.length+1);
    assert.equal(await evaluate('document.getElementById("case-select").value'),company.id);
    assert.equal(await evaluate('document.querySelector(".budget-steps [aria-current]").dataset.step'),'0');
    assert.equal(await evaluate(`document.querySelector('[data-path="config.start"]').value`),'');
    assert.match(await content('budget-notice'),/creada y guardada/);
    await fill('#case-select',existing.id);assert.deepEqual(await active(),existing);assert.equal(await evaluate('document.querySelector("[data-path=name]").value'),'Borrador conservado');
    await fill('#case-select',company.id);
    await open();await fill('[name=companyName]',' comercial  el roble ');await submit();assert.match(await content('budget-company-error'),/Ya existe/);await cancel();
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    await step(0);await field('name','Plan manual');await field('config.start','2026-10-01');await field('config.count',1);
    await step(1);await field('products.0.values.2026-10.units',10);await field('products.0.values.2026-10.price',100);
    await step(2);await field('products.0.initialUnits',0);await field('products.0.inventoryPercent',0);await field('products.0.nextUnits',0);await field('products.0.values.2026-10.unitCost',60);
    await step(3);await field('products.0.initialValue',0);
    await step(4);await click('[data-action=expense]');await field('expenses.0.category','administration');await field('expenses.0.values.2026-10',100);
    await step(5);await field('result.taxMode','none');await save();
    const manual=await active(), r=await analysis();
    assert.equal(r.totals.sales,1000);assert.equal(r.totals.purchases,600);assert.equal(r.totals.operatingExpenses,100);assert.equal(r.totals.netProfit,300);assert.equal(r.stages.income.ready,true);
    assert.deepEqual(manual.balance,[]);assert.deepEqual(manual.income,[]);
    await save();assert.equal((await active()).params.budgetProjections.length,1);
    await send('Page.reload',{},sessionId);await until('!!document.querySelector("[data-path=name]")');assert.deepEqual(await active(),manual);
    assert.equal((await analysis()).totals.netProfit,300);
    await step(1);assert.equal(await evaluate(`document.querySelector('[data-path="products.0.values.2026-10.units"]').value`),'10');
    // El selector compartido conserva empresas y selección en todos los consumidores.
    for(const mod of ['dashboard','analisis-financiero','punto-equilibrio','apalancamiento','origen-aplicacion','flujo-efectivo','proforma','estados-financieros']) {
      await navigate(mod);assert.equal(await evaluate('document.getElementById("case-select").value'),company.id);
      await fill('#case-select',existing.id);assert.deepEqual(await active(),existing);
      await fill('#case-select',company.id);assert.deepEqual(await active(),manual);
      if(mod==='proforma')assert.match(await content('paper-badge-status'),/PENDIENTES/);
    }
    // Estados Financieros conserva la puerta de entrada y «Empieza en blanco».
    await open();await until('!document.getElementById("start-panel").hidden');assert.ok(await evaluate('!!document.getElementById("start-blank")'));
    const count=await evaluate('FinoraCasos.store.list().length');await click('#start-blank');assert.equal(await evaluate('FinoraCasos.store.list().length'),count+1);
    assert.ok((await active()).balance.length>0);await fill('#case-select',company.id);
    await click('#upload-excel');await upload('#financial-file',path.join(__dirname,'fixtures','libro-practica.xlsx'));
    await until('!!document.getElementById("detect-review")');assert.ok(await evaluate('document.querySelectorAll(".detect-card").length>=2'));
    await click('[data-file-cancel]');assert.deepEqual(await active(),manual);
    await navigate('analisis-financiero');await open();await until('location.pathname.endsWith("/estados-financieros/index.html") && !!document.getElementById("start-blank")');
    assert.equal(await evaluate('location.search'),'?nueva=1');assert.deepEqual(await active(),manual);
    // Excel sigue siendo opcional y crea una proyección aparte del plan manual.
    await navigate('planeacion-presupuestos');await click('[data-action=new]');await field('name','Plan importado');await field('config.start','2026-10-01');
    const X=require('../assets/vendor/sheetjs/xlsx.full.min.js'),ref=require('./fixtures/buen-precio.json'),book=X.utils.book_new();
    for(const [name,sheet] of Object.entries(ref.sheets))X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(sheet.values),name);
    const file=path.join(profile,'presupuesto.xlsx');fs.writeFileSync(file,X.write(book,{type:'buffer',bookType:'xlsx'}));
    const review=async()=>{await click('[data-action=import]');await upload('#budget-file',file);await until('!!document.getElementById("budget-file-sheet")');await fill('#budget-file-mode','academic');await fill('#budget-file-sheet','Datos');await click('#budget-import-review');};
    await review();assert.match(await content('budget-file-preview'),/60,900/);await click('#budget-import-cancel');
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.deepEqual(await active(),manual);
    await review();await click('#budget-import-apply');await save();const imported=await active();assert.equal((await analysis()).totals.netProfit,60900);
    assert.equal(imported.params.budgetProjections.length,2);assert.deepEqual(imported.params.budgetProjections.find(p=>p.id===manual.params.budget.id),manual.params.budget);
    assert.deepEqual(imported.balance,[]);assert.deepEqual(imported.income,[]);
    // Un fallo de almacenamiento se informa y el envío repetido no crea otra empresa.
    const disk=await stored();await open();await fill('[name=companyName]','Empresa temporal');
    await evaluate('window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("Sin espacio","QuotaExceededError")}');
    await submit();assert.match(await content('budget-notice'),/solo en memoria/);assert.equal(await stored(),disk);
    const memoryCount=await evaluate('FinoraCasos.store.list().length');await evaluate('document.getElementById("budget-company-form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
    assert.equal(await evaluate('FinoraCasos.store.list().length'),memoryCount);await evaluate('Storage.prototype.setItem=window.originalSet');
    assert.deepEqual(errors,[]);
    console.log('OK: creación local, validación, duplicados, cancelación, envío doble, selección, ventas/compras/gastos manuales (utilidad C$300), recarga, historial intacto, 8 selectores, Excel opcional (C$60900), fallo de almacenamiento y modal escritorio/móvil en ambos temas.');
    screenshots.forEach(file=>console.log(file));
  } finally { await send('Browser.close').catch(()=>browser.kill());await new Promise(resolve=>server.close(resolve)); }
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
