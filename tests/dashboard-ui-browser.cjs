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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-dashboard-ui-'));
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
  const C = require('../assets/js/casos.js'), P = require('../assets/js/paste-import.js'), W = require('../assets/js/workbook-import.js');
  const draft = kind => P.analyze(fs.readFileSync(path.join(__dirname, 'fixtures', `prueba-2025-2026-${kind}.txt`), 'utf8'), { kind });
  const example = W.buildCase(C.blankCase('Empresa de prueba · estados 2025–2026'), draft('balance'), draft('income'));
  try {
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1672, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: base + '/modulos/dashboard/index.html' }, sessionId);
    await until('!!document.querySelector(".dash-first-run")');
    assert.match(await evaluate('document.querySelector(".dash-first-run").textContent'), /Te falta el estado de resultados/);
    assert.ok(await evaluate('!!document.getElementById("dashboard-cash") && !!document.getElementById("dashboard-liquidity") && !!document.querySelector(".dash-funding")'));
    assert.equal(await evaluate('!!document.querySelector(".dash-performance,.dash-scenario")'), false);
    assert.equal(await evaluate('document.documentElement.dataset.presentation'), 'off');
    assert.equal(await evaluate('localStorage.getItem("finora:presentation:v1")'), null, 'El modo claro inicial no escribe preferencias');
    assert.equal(await evaluate('document.querySelectorAll(".dash-bar").length'), 0, 'No se fabrican cifras al iniciar');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".nav-label")).map(e=>e.textContent)'), ['Finanzas empresariales', 'Finanzas personales', 'Control patrimonial']);
    assert.equal(await evaluate('document.querySelectorAll(".nav-item").length'), 12);
    for (const link of await evaluate('Array.from(document.querySelectorAll(".nav-item")).map(a=>a.href)')) assert.equal((await fetch(link)).status, 200);
    for (const width of [1440,390]) for (const mode of ['off','on']) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${mode}'`);
      await shot('balance-'+width+'-'+mode);
    }
    await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);
    assert.ok(await evaluate('document.querySelector(".dash-first-run").getClientRects().length>0 && document.querySelector(".dash-funding").getClientRects().length>0'));
    await send('Emulation.setEmulatedMedia',{media:'screen',features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1080,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate('document.documentElement.dataset.presentation="off"');
    await evaluate(`FinoraCasos.store.add(${JSON.stringify(example)})`); await until('document.getElementById("dashboard-sales")?.textContent.includes("700,000")');
    assert.match(await content('dashboard-profit'), /75,000/); assert.match(await content('dashboard-cash'), /100,000/); assert.match(await content('dashboard-liquidity'), /2.52/);
    const original = await active();
    assert.equal(await evaluate('document.querySelectorAll(".dash-combined .dash-bar").length'), 6); assert.equal(await evaluate('document.querySelectorAll(".dash-profit-point").length'), 2);
    assert.equal(await evaluate('document.querySelectorAll(".dash-quick-link").length'), 4);
    assert.match(await evaluate('document.querySelector(".dash-combined-meta").textContent'), /Ventas.*Costo de ventas.*Gastos operativos.*Utilidad neta/);
    await evaluate('document.querySelector(".dash-profit-point").focus()'); assert.match(await content('dashboard-tooltip'), /Utilidad neta/);
    await evaluate('document.activeElement.blur()');
    await click('[data-chart-kind=balance]'); assert.equal(await evaluate('document.querySelectorAll(".dash-bar").length'), 6);
    await evaluate('document.querySelector(".dash-bar").focus()'); assert.match(await content('dashboard-tooltip'), /Activos/);
    await click('[data-chart-kind=cash]'); assert.equal(await evaluate('document.querySelectorAll(".dash-bar").length'), 4);
    await click('[data-chart-kind=income]'); assert.deepEqual(await active(), original, 'Cambiar gráficos no escribe datos');
    await evaluate('document.activeElement.blur();scrollTo(0,0)'); await shot('fase1-escritorio'); await shot('fase1-completo', true);
    await click('.presentation-toggle'); assert.equal(await evaluate('document.documentElement.dataset.presentation'), 'on'); await shot('fase1-exposicion');
    await send('Page.reload', {}, sessionId); await until('!!document.getElementById("dashboard-sales")'); assert.equal(await evaluate('document.documentElement.dataset.presentation'), 'on');
    assert.deepEqual(await active(), original, 'Recarga y tema conservan datos'); await click('.presentation-toggle');
    // Los controles del escenario siguen usando el motor y la persistencia originales.
    await fill('#projection-growth', 20); await fill('#projection-margin-input', 12); assert.match(await content('projection-sales'), /840,000/); assert.match(await content('projection-profit'), /100,800/);
    assert.deepEqual(await active(), original, 'Vista previa del escenario no altera los estados');
    await evaluate('document.getElementById("dashboard-scenario").requestSubmit()'); const saved = await active();
    assert.equal(saved.params.dashboard.growth, 20); assert.deepEqual(saved.balance, original.balance); assert.deepEqual(saved.income, original.income);
    await fill('#projection-growth', 201); assert.equal(await evaluate('document.querySelector("#dashboard-scenario button[type=submit]").disabled'), true);
    await fill('#projection-growth', 20);
    for (const width of [1440, 1024, 760, 390]) for (const mode of ['off', 'on']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`document.documentElement.dataset.presentation='${mode}';scrollTo(0,0)`);
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const layout = await evaluate('({overflow:document.documentElement.scrollWidth>innerWidth+1,small:Array.from(document.querySelectorAll(".dash-kpi .stat-label,.dash-quick-link strong,.dash-tabs button,.nav-item,.nav-label")).some(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<11)})');
      assert.deepEqual(layout, { overflow: false, small: false }, `Diseño ${width} ${mode}`);
      if (width === 390 && mode === 'off') {
        await shot('fase1-movil');
        await evaluate('document.querySelector(".dash-performance").scrollIntoView({block:"start"})'); await shot('fase1-movil-grafico');
        await click('.menu-toggle'); assert.equal(await evaluate('document.body.classList.contains("sidebar-open")'), true);
        assert.equal(await evaluate('document.getElementById("sidebar").inert'), false); await shot('fase1-menu-movil');
        await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'); assert.equal(await evaluate('document.body.classList.contains("sidebar-open")'), false);
      }
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1672, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate('document.documentElement.dataset.presentation="off";scrollTo(0,0)');
    await fill('#case-select', 'mundo-moda'); assert.equal(await evaluate('!!document.getElementById("dashboard-profit")'), false); assert.equal(await evaluate('document.querySelectorAll(".dash-profit-point").length'), 0);
    assert.match(await evaluate('document.querySelector(".dash-first-run").textContent'), /Te falta el estado de resultados/); await fill('#case-select', original.id);
    await evaluate('(()=>{const c=FinoraCasos.store.active();c.reported={};c.income.find(a=>a.category==="costSales").amounts.current=800000;FinoraCasos.store.save(c)})()');
    assert.equal(await evaluate('document.getElementById("dashboard-health").dataset.state'), 'negative'); assert.match(await content('dashboard-profit'), /−/);
    assert.ok(await evaluate('Array.from(document.querySelectorAll(".dash-profit-point")).some(point=>point.getAttribute("aria-label").includes("−"))'));
    await shot('fase1-perdida');
    await evaluate(`FinoraCasos.store.save(${JSON.stringify(original)})`);
    await send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    assert.equal(await evaluate('getComputedStyle(document.getElementById("dashboard-scenario")).display'), 'none');
    assert.ok(await evaluate('document.getElementById("projection-sales").getClientRects().length>0')); await send('Emulation.setEmulatedMedia', { media: 'screen' }, sessionId);
    assert.deepEqual(errors, []);
    console.log('OK: dashboard visual, gráfico combinado real, estados vacíos/pérdida, datos intactos, escenarios, menú, enlaces, teclado, impresión y 4 anchos en ambos modos.');
    screenshots.forEach(file => console.log(file));
  } finally { await send('Browser.close').catch(() => browser.kill()); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
