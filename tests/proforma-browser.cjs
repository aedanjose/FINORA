'use strict';
// Prueba aislada con Edge/Chromium y CDP nativo de Node; no requiere Playwright.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const http = require('node:http'), os = require('node:os'), { spawn } = require('node:child_process');
const C = require('../assets/js/casos.js');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-proforma-browser-'));
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
  const fill = (setting, value) => evaluate(`(() => {const e=document.querySelector('[data-setting="${setting}"]');if(!e)throw Error('Campo ausente: ${setting}');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const report = () => evaluate('FinoraProforma.analyze(FinoraCasos.store.active())');
  try {
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: base + '/modulos/proforma/index.html' }, sessionId);
    await until('document.getElementById("projection-controls")?.children.length > 0');
    await evaluate(`FinoraCasos.store.add(${JSON.stringify(C.samples.dayton())})`);
    assert.equal(await evaluate('typeof FinoraBudget'), 'undefined');
    assert.equal(await evaluate('FinoraLeverage.analyze(FinoraCasos.store.active()).unavailable'), true);
    await fill('start', '2013-01-01'); await fill('end', '2013-12-31'); await fill('salesValue', 20); await fill('dividends', 1000);
    assert.match(await evaluate('document.getElementById("income-proforma-body").textContent'), /10,808.14/);
    assert.equal(await evaluate('FinoraCasos.store.active().params.proforma'), undefined, 'Los cambios son un borrador hasta guardar');
    await click('#save-projection');
    const saved = await report(); assert.equal(saved.income.ready, true); assert.equal(saved.balance.ready, false);
    await send('Page.reload', {}, sessionId); await until('document.querySelector("[data-setting=salesValue]")?.value === "20"');
    assert.equal((await report()).income.netProfit, saved.income.netProfit);
    await evaluate('const c=FinoraCasos.store.active();c.params.budget={mode:"cash",sentinel:7654321};FinoraCasos.store.save(c)');
    assert.equal((await report()).income.netProfit, saved.income.netProfit);
    await fill('method', 'mixed');
    for (const [id, fixed] of [['dy-i2', 0], ['dy-i3', 100], ['dy-i4', 100], ['dy-i5', 100]]) {
      await evaluate(`(() => {const e=document.querySelector('[data-line="${id}"][data-line-field="fixedPercent"]');e.value='${fixed}';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    }
    await click('[data-line="dy-i4"][data-line-field="depreciation"]');
    await click('[data-setting="balance.enabled"]');
    await fill('balance.cash', 8000); await fill('balance.capex', 20000); await fill('balance.disposals', 0); await fill('balance.equityChange', 0);
    await click('#save-projection'); assert.equal((await report()).balance.ready, true, JSON.stringify((await report()).balance.issues));
    await fill('salesValue', -101);
    assert.match(await evaluate('document.getElementById("proforma-pending").textContent'), /Crecimiento de ventas/);
    await fill('salesValue', 20); await click('#save-projection');
    const second = await send('Target.createTarget', { url: base + '/modulos/proforma/index.html' });
    const attached = await send('Target.attachToTarget', { targetId: second.targetId, flatten: true });
    await send('Runtime.enable', {}, attached.sessionId);
    const deadline = Date.now() + 10000;
    while (!await evaluateIn(attached.sessionId, 'typeof FinoraCasos !== "undefined"')) {
      if (Date.now() > deadline) throw Error('No cargó la segunda pestaña');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await evaluateIn(attached.sessionId, 'const c=FinoraCasos.store.active();c.income.find(a=>a.category==="sales").amounts.current+=10000;FinoraCasos.store.save(c)');
    await until('document.getElementById("income-proforma-body").textContent.includes("226,690.80")');
    assert.equal((await report()).income.sales, 226690.8);
    await send('Target.closeTarget', { targetId: second.targetId });
    await click('#tab-balance');
    assert.equal(await evaluate('document.getElementById("report-income").hidden'), true);
    await evaluate('document.getElementById("tab-balance").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');
    assert.equal(await evaluate('document.getElementById("report-balance").hidden'), true);
    const gao = await evaluate('document.getElementById("proforma-gao-val").textContent'); assert.notEqual(gao, '—');
    for (const width of [1440, 390]) for (const presentation of ['on', 'off']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${presentation}'`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+1,small:Array.from(document.querySelectorAll('#projection-controls .field-label,.proforma-assumptions summary,.proforma-comparison small')).filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11).length})`);
      if (layout.overflow) console.log(await evaluate(`Array.from(document.querySelectorAll('main,.proforma-assumptions,.proforma-layout,.report-controls,.report-preview,.report-paper,.proforma-comparison,.proforma-table-scroll,.input,.select')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({element:e.id||e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))`));
      assert.deepEqual(layout, { overflow: false, small: 0 }, width + ' ' + presentation);
    }
    await send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".proforma-assumptions")).display'), 'none');
    assert.equal(await evaluate('document.getElementById("report-balance").hidden'), true);
    await send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId);
    await send('Page.navigate', { url: base + '/modulos/apalancamiento/index.html?source=proforma' }, sessionId);
    await until(`document.getElementById("gao-val")?.textContent === ${JSON.stringify(gao)}`);
    assert.equal(await evaluate('document.getElementById("gao-val").textContent'), gao);
    await send('Page.navigate', { url: base + '/modulos/proforma/index.html' }, sessionId);
    await until('document.getElementById("projection-controls")?.children.length > 0');
    await click('#new-projection'); await fill('name', 'Alternativa'); await fill('start', '2013-01-01'); await fill('end', '2013-12-31'); await fill('salesValue', 0); await fill('dividends', 0); await click('#save-projection');
    assert.equal(await evaluate('FinoraCasos.store.active().params.proformaProjections.length'), 2);
    assert.equal(await evaluate('FinoraCasos.store.active().params.budget.sentinel'), 7654321);
    const firstId = await evaluate('FinoraCasos.store.active().params.proformaProjections[0].id');
    await evaluate(`(() => {const e=document.getElementById('saved-projection');e.value=${JSON.stringify(firstId)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('#save-projection');
    assert.equal(await evaluate('FinoraCasos.store.active().params.proforma.id'), firstId);
    await evaluate(`FinoraCasos.store.add(${JSON.stringify(C.samples['mundo-moda']())})`);
    assert.equal(await evaluate('document.querySelector("[data-setting=salesValue]").value'), '');
    assert.match(await evaluate('document.getElementById("paper-badge-status").textContent'), /PENDIENTES/);
    assert.deepEqual(errors, []);
    console.log('OK: Edge aislado; captura, recálculo, guardado/recarga, comparación, balance, Apalancamiento, dos empresas, móvil/escritorio, claro/oscuro e impresión.');
  } finally {
    await send('Browser.close').catch(() => browser.kill());
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
