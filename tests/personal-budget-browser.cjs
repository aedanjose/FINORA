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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-personal-browser-'));
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
  const state = () => evaluate('FinoraPersonal.createStore().load()');
  const content = id => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const submit = () => evaluate('document.getElementById("personal-form").requestSubmit()');
  const add = async (type, amount, description, category, date = '2026-06-15') => {
    await click('#add-personal-movement'); await fill('#personal-form [name=type]', type);
    for (const [key, value] of Object.entries({ amount, description, category, date })) await fill(`#personal-form [name=${key}]`, value);
    if (type === 'expense') await fill('#personal-form [name=priority]', 'need');
    await submit();
    assert.equal(await evaluate('document.getElementById("personal-draft").hidden'), true, await content('personal-form-error'));
  };
  try {
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: base + '/modulos/presupuesto-personal/index.html' }, sessionId);
    await until('document.getElementById("personal-income")?.textContent === "C$ 0.00"');
    assert.match(await content('personal-movement-rows'), /No hay movimientos/);
    await evaluate('localStorage.setItem("finora:casos:v1","empresa intacta");localStorage.setItem("finora:global_currency","USD")');
    await fill('#personal-period', '2026-06');
    await add('income', 3000, 'Salario del mes', 'Salario');
    await add('expense', 2575, 'Gastos del mes', 'Alimentación');
    await add('saving', 240, 'Separado para ahorro', 'Fondo propio');
    assert.equal(await content('personal-available'), 'C$ 185.00');
    assert.equal(await content('personal-reserve'), 'C$ 0.00');
    assert.equal(await content('personal-accumulated-saving'), 'C$ 240.00');
    const saved = await state();
    await send('Page.reload', {}, sessionId); await until('document.getElementById("personal-available")?.textContent === "C$ 185.00"');
    assert.equal(await evaluate('document.getElementById("personal-period").value'), '2026-06');
    assert.deepEqual((await state()).movements.map(row => row.id), saved.movements.map(row => row.id));
    assert.equal(await evaluate('document.querySelector(".topbar-currency-btn strong").textContent'), 'C$');
    await click('#personal-tab-income'); assert.equal(await evaluate('document.querySelectorAll("[data-movement]").length'), 1);
    await click('#personal-tab-expense'); assert.equal(await evaluate('document.querySelectorAll("[data-movement]").length'), 1);
    assert.equal(await content('personal-available'), 'C$ 185.00');
    await evaluate('document.getElementById("personal-tab-expense").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');
    assert.equal(await evaluate('document.querySelectorAll("[data-movement]").length'), 3);
    const expense = saved.movements.find(row => row.type === 'expense');
    await click(`[data-id="${expense.id}"] [data-action=edit]`); await fill('#personal-form [name=amount]', 2600);
    await fill('#personal-form [name=description]', '<img src=x onerror=alert(1)>'); await fill('#personal-form [name=paymentMethod]', 'Efectivo'); await submit();
    assert.equal((await state()).movements.find(row => row.id === expense.id).amount, 2600);
    assert.equal(await content('personal-available'), 'C$ 160.00');
    assert.equal(await evaluate('document.querySelectorAll("#personal-movement-rows img").length'), 0);
    await add('reserve', 40, 'Reserva del mes', 'Imprevistos');
    assert.equal(await content('personal-available'), 'C$ 120.00'); assert.equal(await content('personal-expense'), 'C$ 2,600.00');
    const saving = saved.movements.find(row => row.type === 'saving');
    await click(`[data-id="${saving.id}"] [data-action=delete]`); await click('.detail-dialog .dialog-header button');
    assert.equal((await state()).movements.length, 4);
    await click(`[data-id="${saving.id}"] [data-action=delete]`); await click('#personal-delete-confirm');
    assert.equal(await content('personal-available'), 'C$ 360.00'); assert.equal(await content('personal-accumulated-saving'), 'C$ 0.00');
    await fill('#personal-period', '2026-07'); assert.equal(await content('personal-available'), 'C$ 360.00');
    assert.equal(await content('personal-income'), 'C$ 0.00'); assert.equal(await content('personal-reserve'), 'C$ 0.00');
    assert.equal(await content('personal-accumulated-reserve'), 'C$ 40.00');
    await add('income', 100, 'Ingreso de julio', 'Ingreso adicional', '2026-07-01'); assert.equal(await content('personal-available'), 'C$ 460.00');
    await fill('#personal-period', '2026-06'); await click(`[data-id="${expense.id}"] [data-action=edit]`); await fill('#personal-form [name=amount]', 2500); await submit();
    await fill('#personal-period', '2026-07'); assert.equal(await content('personal-available'), 'C$ 560.00');
    await click('#personal-opening-details summary');
    for (const [key, value] of Object.entries({ period: '2026-06', available: 50, saving: 1000, reserve: 500 })) await fill(`#personal-opening-form [name=${key}]`, value);
    await evaluate('document.getElementById("personal-opening-form").requestSubmit()');
    assert.equal(await content('personal-available'), 'C$ 610.00'); assert.equal(await content('personal-income'), 'C$ 100.00');
    assert.equal(await content('personal-accumulated-saving'), 'C$ 1,000.00'); assert.equal(await content('personal-accumulated-reserve'), 'C$ 540.00');
    const count = (await state()).movements.length;
    await click('#add-personal-movement'); await fill('#personal-form [name=amount]', -1); await submit();
    assert.equal(await evaluate('document.getElementById("personal-form").checkValidity()'), false); assert.equal((await state()).movements.length, count);
    await fill('#personal-form [name=type]', 'income'); await fill('#personal-form [name=description]', '   ');
    await fill('#personal-form [name=category]', 'Salario'); await fill('#personal-form [name=amount]', 10); await submit();
    assert.match(await content('personal-form-error'), /Descripción/); assert.equal((await state()).movements.length, count);
    await fill('#personal-form [name=description]', 'Pendiente de guardar');
    await evaluate('window.originalPersonalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===FinoraPersonal.STORAGE_KEY)throw new DOMException("Lleno","QuotaExceededError");return originalPersonalSetItem.call(this,key,value)}');
    await submit(); assert.match(await content('personal-form-error'), /No se pudo guardar/);
    assert.equal((await state()).movements.length, count); assert.equal(await evaluate('document.getElementById("personal-draft").hidden'), false);
    await evaluate('Storage.prototype.setItem=originalPersonalSetItem'); await submit(); assert.equal((await state()).movements.length, count + 1);
    await click('#add-personal-movement');
    for (const width of [1440, 390]) for (const mode of ['on', 'off']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${mode}'`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout = await evaluate('({overflow:document.documentElement.scrollWidth>innerWidth+1,small:Array.from(document.querySelectorAll(".field-label,.personal-row-actions .button,.personal-funds dt")).filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11).length})');
      if (layout.overflow) console.log(await evaluate('Array.from(document.querySelectorAll(".panel,.form-grid,.personal-welcome,.personal-balance,.input,.select,.stat-card")).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({element:e.id||e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))'));
      assert.deepEqual(layout, { overflow: false, small: 0 }, `${width} ${mode}`);
    }
    assert.equal(await evaluate('localStorage.getItem("finora:casos:v1")'), 'empresa intacta');
    assert.equal(await evaluate('localStorage.getItem("finora:global_currency")'), 'USD');
    const personalSaved = await evaluate('localStorage.getItem(FinoraPersonal.STORAGE_KEY)');
    await evaluate('localStorage.setItem(FinoraPersonal.STORAGE_KEY,"{invalido");dispatchEvent(new StorageEvent("storage",{key:FinoraPersonal.STORAGE_KEY}))');
    assert.match(await content('personal-storage-error'), /No se sobrescribieron/);
    assert.equal(await content('personal-available'), '—'); assert.equal(await content('personal-formula'), '—');
    assert.equal(await evaluate('document.getElementById("add-personal-movement").disabled'), true);
    assert.equal(await evaluate('localStorage.getItem(FinoraPersonal.STORAGE_KEY)'), '{invalido');
    await evaluate(`localStorage.setItem(FinoraPersonal.STORAGE_KEY,${JSON.stringify(personalSaved)});dispatchEvent(new StorageEvent('storage',{key:FinoraPersonal.STORAGE_KEY}))`);
    assert.equal(await evaluate('document.getElementById("personal-storage-error").hidden'), true);
    // Un segundo escenario aislado conserva toda la regresión manual de Fase 1.
    // La variable opcional usa el Excel real sin copiarlo al repositorio ni modificarlo.
    const X = require('../assets/vendor/sheetjs/xlsx.full.min.js');
    const book = X.utils.book_new(), headers = ['Fecha', 'Tipo de movimiento', 'Categoría', 'Descripción', 'Monto', 'Prioridad', 'Medio'];
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([['Costo de la meta:', 3500], ['Meta al final del semestre:', 'Meta de prueba']]), 'Inicio y meta');
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([headers, ['2026-09-01', 'Ingreso', 'Salario', 'Ingreso importado', 3000, '', ''], ['2026-09-02', 'Gasto', 'Alimentación', 'Gasto importado', 2575, 'Necesidad', ''], ['2026-09-03', 'Ahorro', 'Meta personal', 'Ahorro importado', 240, '', '']]), 'Registro semanal');
    for (const name of ['Seguimiento', 'Presupuesto proyectado', 'Listas']) X.utils.book_append_sheet(book, X.utils.aoa_to_sheet([['Resumen'], [3000, 2575, 240]]), name);
    const generatedFile = path.join(profile, 'presupuesto-prueba.xlsx');
    const writeFixture = () => fs.writeFileSync(generatedFile, X.write(book, { type: 'buffer', bookType: 'xlsx' })); writeFixture();
    const reference = process.env.FINORA_PERSONAL_XLSX || generatedFile;
    const upload = async file => {
      const { root: doc } = await send('DOM.getDocument', {}, sessionId);
      const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#personal-import-file' }, sessionId);
      await send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(file)] }, sessionId);
      await until('document.getElementById("personal-import-status").textContent !== "Leyendo el Excel…"');
    };
    await click('#personal-cancel');
    await evaluate('localStorage.removeItem(FinoraPersonal.STORAGE_KEY);dispatchEvent(new StorageEvent("storage",{key:FinoraPersonal.STORAGE_KEY}))');
    await upload(reference);
    await until('document.getElementById("personal-import-confirm").disabled === false');
    assert.equal((await state()).movements.length, 0, 'La lectura no debe guardar antes de confirmar');
    assert.equal(await evaluate('document.querySelectorAll("#personal-import-sheets li").length'), 5);
    assert.match(await content('personal-import-totals'), /C\$ 185\.00/);
    const mobileCheck = async () => {
      for (const width of [1440, 390]) for (const mode of ['on', 'off']) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
        await evaluate(`document.documentElement.dataset.presentation='${mode}'`);
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false, `Importación y gráficos sin desborde a ${width}, modo ${mode}`);
        assert.equal(await evaluate('Array.from(document.querySelectorAll(".personal-notices,.personal-chart-caption,.personal-insights td,.personal-import summary")).some(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11)'), false);
      }
    };
    await evaluate('document.querySelector("#personal-import-preview details").open=true'); await mobileCheck();
    await click('#personal-import-confirm'); assert.equal(await content('personal-available'), 'C$ 185.00');
    assert.equal(await content('personal-goal-percent'), '6.86 % de avance');
    assert.equal(await evaluate('document.querySelector("[data-total=income] dd").textContent'), 'C$ 3,000.00');
    assert.equal(await evaluate('document.querySelector("[data-total=expense] dd").textContent'), 'C$ 2,575.00');
    const imported = await state(), importedIds = imported.movements.map(m => m.id);
    if (process.env.FINORA_PERSONAL_XLSX) assert.equal(importedIds.length, 84);
    assert.ok(await evaluate('document.querySelectorAll("#personal-weekly-chart [data-series=available]").length>0'));
    const snapshot = await evaluate('JSON.stringify(FinoraPersonal.overview(FinoraPersonal.createStore().load(),"2026-09"))');
    await send('Page.reload', {}, sessionId); await until('document.getElementById("personal-goal-percent")?.textContent === "6.86 % de avance"');
    assert.deepEqual((await state()).movements.map(m => m.id), importedIds);
    assert.equal(await evaluate('JSON.stringify(FinoraPersonal.overview(FinoraPersonal.createStore().load(),"2026-09"))'), snapshot);
    await upload(reference); await until('!document.getElementById("personal-import-confirm").disabled');
    assert.match(await content('personal-import-impact'), /0 nuevos/); await click('#personal-import-confirm');
    assert.deepEqual((await state()).movements.map(m => m.id), importedIds);
    const chartBefore = await content('personal-monthly-chart');
    await add('expense', 5, 'Compra posterior a importar', 'Categoría nueva', '2026-09-30');
    assert.equal(await content('personal-available'), 'C$ 180.00'); assert.notEqual(await content('personal-monthly-chart'), chartBefore);
    assert.match(await content('personal-category-rows'), /Categoría nueva/);
    const manual = (await state()).movements.find(m => m.description === 'Compra posterior a importar');
    await click(`[data-id="${manual.id}"] [data-action=edit]`); await fill('#personal-form [name=amount]', 10); await submit();
    assert.equal(await content('personal-available'), 'C$ 175.00');
    assert.ok(await evaluate('Array.from(document.querySelectorAll("#personal-weekly-chart [data-series=available]")).at(-1).dataset.value === "175"'));
    await click(`[data-id="${manual.id}"] [data-action=delete]`); await click('#personal-delete-confirm');
    assert.equal(await content('personal-available'), 'C$ 185.00'); assert.equal(await content('personal-monthly-chart'), chartBefore);
    await add('saving', 10, 'Aporte posterior', 'Meta personal', '2026-09-30'); assert.equal(await content('personal-goal-percent'), '7.14 % de avance');
    await fill('#personal-period', '2026-10'); assert.equal(await content('personal-available'), 'C$ 175.00'); assert.equal(await content('personal-income'), 'C$ 0.00');
    assert.equal(await content('personal-goal-percent'), '7.14 % de avance'); await fill('#personal-period', '2026-09');
    await mobileCheck();
    // Error de lectura: conservar todo el registro confirmado.
    const beforeBad = await state(), badFile = path.join(profile, 'incompatible.xlsx'); fs.writeFileSync(badFile, 'no es Excel');
    await upload(badFile); await until('!document.getElementById("personal-import-error").hidden');
    assert.match(await content('personal-import-error'), /No se pudo leer/); assert.deepEqual(await state(), beforeBad);
    // Una prioridad ausente exige corrección en la vista previa; no se inventa.
    book.Sheets['Registro semanal'].F3 = { t: 's', v: '' }; writeFixture();
    await upload(generatedFile); await until('!document.getElementById("personal-import-preview").hidden');
    assert.equal(await evaluate('document.getElementById("personal-import-confirm").disabled'), true);
    await click('[data-import-row="1"] button'); await fill('#personal-import-edit [name=priority]', 'want');
    await evaluate('document.getElementById("personal-import-edit").requestSubmit()');
    assert.equal(await evaluate('document.getElementById("personal-import-confirm").disabled'), false);
    await fill('#personal-import-mode', 'replace'); assert.match(await content('personal-import-impact'), /existentes por reemplazar/);
    // Cancelar conserva los datos; confirmar reemplaza solo septiembre.
    await click('#personal-import-cancel'); assert.deepEqual(await state(), beforeBad);
    book.Sheets['Registro semanal'].F3 = { t: 's', v: 'Necesidad' }; writeFixture(); await upload(generatedFile);
    await until('!document.getElementById("personal-import-confirm").disabled'); await fill('#personal-import-mode', 'replace');
    const earlierIds = beforeBad.movements.filter(m => m.date < '2026-09-01').map(m => m.id);
    await click('#personal-import-confirm'); assert.deepEqual((await state()).movements.filter(m => m.date < '2026-09-01').map(m => m.id), earlierIds);
    assert.equal((await state()).movements.filter(m => m.date.startsWith('2026-09')).length, 3);
    assert.equal(await evaluate('localStorage.getItem("finora:casos:v1")'), 'empresa intacta');
    assert.equal(await evaluate('localStorage.getItem("finora:global_currency")'), 'USD');
    assert.deepEqual(errors, []);
    console.log('OK: Edge aislado; regresión Fase 1 y Excel ' + (process.env.FINORA_PERSONAL_XLSX ? 'real (84 movimientos)' : 'de prueba') + '; vista previa, confirmación, C$185, meta 6.86%, recarga e IDs, reimportación, CRUD manual, actualización de gráficos, errores, corrección, cancelación/reemplazo por mes y móvil/escritorio claro/oscuro.');
  } finally {
    await send('Browser.close').catch(() => browser.kill());
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
