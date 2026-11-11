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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-assets-browser-'));
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
  const state = () => evaluate('FinoraAssets.createStore().load()');
  const content = id => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const upload = async file => {
    const { root: doc } = await send('DOM.getDocument', {}, sessionId);
    const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#assets-file' }, sessionId);
    await send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(file)] }, sessionId);
    await until('document.getElementById("assets-file-status").textContent !== "Leyendo Excel…"');
  };
  const submit = () => evaluate('document.getElementById("assets-form").requestSubmit()');
  const mobile = async () => {
    for (const width of [1440, 390]) for (const mode of ['on', 'off']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${mode}'`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'), false, `${width}, ${mode}: sin desbordamiento de la página`);
      assert.equal(await evaluate('Array.from(document.querySelectorAll(".field-label,.assets-chart-caption,.data-table td,summary")).some(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11)'), false);
    }
  };
  try {
    assert.ok(process.env.FINORA_ASSETS_XLSX, 'Indica FINORA_ASSETS_XLSX para probar la importación del archivo real.');
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Page.navigate', { url: base + '/modulos/inventario/index.html' }, sessionId);
    await until('document.getElementById("summary-products")?.textContent === "8"');
    assert.ok(await evaluate('!!document.querySelector("a[href*=levantamiento-activos]")'));
    const links = await evaluate('Array.from(document.querySelectorAll(".nav-item")).map(a=>a.href)');
    for (const link of links) assert.equal((await fetch(link)).status, 200, 'Enlace del menú válido');
    await click('a[href*="levantamiento-activos"]'); await until('document.getElementById("assets-rows")?.textContent.includes("Sin activos")');
    assert.match(await content('assets-rows'), /Sin activos/);
    assert.equal(await evaluate('document.querySelector(".nav-item[aria-current=page]").textContent'), 'Levantamiento de activos');
    await evaluate('localStorage.setItem("finora:personal-budget:v1","personal intacto");localStorage.setItem("finora:casos:v1","empresas intactas");localStorage.setItem("finora:global_currency","USD")');
    await upload(process.env.FINORA_ASSETS_XLSX); await until('!document.getElementById("assets-import-confirm").disabled');
    assert.equal((await state()).assets.length, 0); assert.equal(await evaluate('document.querySelectorAll("#assets-sheets li").length'), 3);
    assert.match(await content('assets-import-totals'), /C\$ 56,451\.67/);
    await evaluate('document.querySelector("#assets-preview details").open=true'); await mobile();
    await click('#assets-import-confirm'); assert.equal(await content('assets-count'), '10'); assert.equal(await content('assets-cost'), 'C$ 122,900.00');
    assert.equal(await content('assets-accumulated'), 'C$ 66,448.33'); assert.equal(await content('assets-book'), 'C$ 56,451.67'); assert.match(await content('assets-replacement'), /153,000\.00/);
    const imported = await state(), ids = imported.assets.map(a => a.id); assert.equal(imported.year, 2026);
    await send('Page.reload', {}, sessionId); await until('document.getElementById("assets-count")?.textContent === "10"'); assert.deepEqual((await state()).assets.map(a => a.id), ids);
    await upload(process.env.FINORA_ASSETS_XLSX); await until('!document.getElementById("assets-import-confirm").disabled'); assert.match(await content('assets-import-impact'), /0 nuevos/);
    await click('#assets-import-confirm'); assert.deepEqual((await state()).assets.map(a => a.id), ids);
    await fill('#assets-area', 'Patio'); assert.equal(await evaluate('document.querySelectorAll("#assets-rows [data-action=edit]").length'), 2);
    await fill('#assets-area', ''); await fill('#assets-condition', 'exhausted'); assert.match(await content('assets-rows'), /Bomba de agua/);
    assert.equal(await evaluate('document.querySelectorAll("#assets-rows [data-action=edit]").length'), 1); await fill('#assets-condition', '');
    const asset = imported.assets.find(a => a.name === 'Tanque de agua'), beforeChart = await content('assets-type-chart');
    await click(`[data-asset-id="${asset.id}"] [data-action=edit]`); await fill('#assets-form [name=cost]', 10000); await submit();
    assert.equal((await state()).assets.find(a => a.id === asset.id).cost, 10000); assert.notEqual(await content('assets-type-chart'), beforeChart);
    assert.equal(await content('assets-cost'), 'C$ 124,400.00');
    await fill('#assets-year', 2027); await evaluate('document.getElementById("assets-year-form").requestSubmit()');
    assert.equal((await state()).year, 2027); assert.notEqual(await content('assets-book'), 'C$ 56,451.67');
    await fill('#assets-year', 2010); await evaluate('document.getElementById("assets-year-form").requestSubmit()'); assert.match(await content('assets-storage-error'), /posterior/); assert.equal((await state()).year, 2027);
    await fill('#assets-year', 2026); await evaluate('document.getElementById("assets-year-form").requestSubmit()');
    await click('#assets-add');
    for (const [key, value] of Object.entries({ name: '<img src=x onerror=alert(1)>', area: 'Oficina', type: 'Equipo nuevo', purchaseYear: 2026, cost: 100, life: 5, residual: 10, recommendation: 'Revisar' })) await fill(`#assets-form [name=${key}]`, value);
    await submit(); assert.equal(await content('assets-count'), '11'); assert.equal(await evaluate('document.querySelectorAll("#assets-rows img").length'), 0); assert.match(await content('assets-replacement'), /parcial/);
    const manual = (await state()).assets.find(a => a.area === 'Oficina');
    await click(`[data-asset-id="${manual.id}"] [data-action=delete]`); await click('.detail-dialog .dialog-header button'); assert.equal((await state()).assets.length, 11);
    await click(`[data-asset-id="${manual.id}"] [data-action=delete]`); await click('#assets-delete-confirm'); assert.equal(await content('assets-count'), '10');
    await click('#assets-add'); await fill('#assets-form [name=cost]', -1); await submit(); assert.equal(await evaluate('document.getElementById("assets-form").checkValidity()'), false); assert.equal((await state()).assets.length, 10);
    await mobile(); await click('#assets-editor-close');
    // No hay escrituras parciales si el navegador rechaza el guardado.
    await click(`[data-asset-id="${asset.id}"] [data-action=edit]`); await fill('#assets-form [name=cost]', 11000);
    await evaluate('window.originalAssetSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===FinoraAssets.KEY)throw Error("quota");return originalAssetSetItem.call(this,k,v)}');
    await submit(); assert.match(await content('assets-form-error'), /No se pudo guardar/); assert.equal((await state()).assets.find(a => a.id === asset.id).cost, 10000);
    await evaluate('Storage.prototype.setItem=originalAssetSetItem'); await click('#assets-editor-close');
    await upload(process.env.FINORA_ASSETS_XLSX); await until('!document.getElementById("assets-import-confirm").disabled'); await fill('#assets-import-mode', 'replace');
    assert.match(await content('assets-import-impact'), /10 existentes por reemplazar/); await click('#assets-import-cancel'); assert.equal((await state()).assets.find(a => a.id === asset.id).cost, 10000);
    await upload(process.env.FINORA_ASSETS_XLSX); await until('!document.getElementById("assets-import-confirm").disabled'); await fill('#assets-import-mode', 'replace'); await click('#assets-import-confirm');
    assert.equal(await content('assets-book'), 'C$ 56,451.67');
    const bad = path.join(profile, 'bad.xlsx'); fs.writeFileSync(bad, 'invalid'); await upload(bad); await until('!document.getElementById("assets-file-error").hidden'); assert.match(await content('assets-file-error'), /No se pudo leer/); assert.equal(await content('assets-count'), '10');
    const X = require('../assets/vendor/sheetjs/xlsx.full.min.js'), w = X.utils.book_new();
    X.utils.book_append_sheet(w, X.utils.aoa_to_sheet([['Activo', 'Área', 'Tipo', 'Año compra', 'Costo', 'Vida útil', 'Residual', 'Edad 2026'], ['Activo incompleto', 'Patio', 'Equipo', 2025, 100, null, 0]]), 'ACTIVOS');
    const incomplete = path.join(profile, 'incomplete.xlsx'); fs.writeFileSync(incomplete, X.write(w, { type: 'buffer', bookType: 'xlsx' }));
    await upload(incomplete); await until('!document.getElementById("assets-preview").hidden'); assert.equal(await evaluate('document.getElementById("assets-import-confirm").disabled'), true);
    await click('[data-import-row="0"] button'); await fill('#assets-form [name=life]', 5); await submit(); assert.equal(await evaluate('document.getElementById("assets-import-confirm").disabled'), false);
    await click('#assets-import-confirm'); assert.equal(await content('assets-count'), '11');
    assert.equal(await evaluate('localStorage.getItem("finora:personal-budget:v1")'), 'personal intacto'); assert.equal(await evaluate('localStorage.getItem("finora:casos:v1")'), 'empresas intactas'); assert.equal(await evaluate('localStorage.getItem("finora:global_currency")'), 'USD');
    const saved = await evaluate('localStorage.getItem(FinoraAssets.KEY)');
    await evaluate('localStorage.setItem(FinoraAssets.KEY,"{bad");dispatchEvent(new StorageEvent("storage",{key:FinoraAssets.KEY}))');
    assert.equal(await evaluate('document.getElementById("assets-results").hidden'), true); assert.match(await content('assets-storage-error'), /No se sobrescribieron/);
    await evaluate(`localStorage.setItem(FinoraAssets.KEY,${JSON.stringify(saved)});dispatchEvent(new StorageEvent('storage',{key:FinoraAssets.KEY}))`);
    assert.equal(await evaluate('document.getElementById("assets-results").hidden'), false); assert.deepEqual(errors, []);
    console.log('OK: Edge con Excel real; menú y enlaces, vista previa, C$56451.67, persistencia, IDs, reimportación, filtros, CRUD, cambio de año, gráficos, validación, aislamiento, fallos de lectura/guardado, corrección y móvil/escritorio en ambos modos.');
  } finally {
    await send('Browser.close').catch(() => browser.kill()); await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
