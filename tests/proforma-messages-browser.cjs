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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-proforma-messages-'));
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
  const C=require('../assets/js/casos.js'),P=require('../assets/js/proforma.js');
  const line=(id,category,current)=>({id,name:id,category,sign:1,amounts:{previous:current,current}});
  const c=C.blankCase('Ejercicio proforma');c.income=[line('sales','sales',100000),line('cost','costSales',60000),line('admin','opex',15000),line('dep','opex',5000),line('interest','interest',2000),line('tax','taxes',5400),line('other','otherIncome',0)];
  const balances={cash:10000,receivables:15000,inventory:20000,fixed:50000,payables:12000,longDebt:18000,equity:65000};c.balance=C.engine.defaultAccounts();c.balance.forEach(a=>{a.amounts={previous:balances[a.id]||0,current:balances[a.id]||0}});
  const s=P.newProjection(c);Object.assign(s,{start:'2026-01-01',end:'2026-12-31',salesValue:20,dividends:3600});s.lines={cost:{fixedPercent:20},admin:{fixedPercent:100},dep:{fixedPercent:100,depreciation:true}};Object.assign(s.balance,{enabled:true,cash:10000,capex:10000,disposals:0,equityChange:0,retainedOpening:25000});
  try{
    await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await send('Page.navigate',{url:base+'/modulos/proforma/index.html'},sessionId);await until('!!document.querySelector("#proforma-pending details")');
    assert.equal(await evaluate('document.getElementById("income-pending-message").hidden'),false);
    assert.equal(await evaluate('document.querySelectorAll("#income-proforma-body tr").length'),12);
    assert.equal(await evaluate('document.querySelectorAll("#proforma-pending > p").length'),1);
    assert.match(await evaluate('document.querySelector("#proforma-pending > p").textContent'),/ventas.*costos.*gastos.*intereses.*impuestos.*dividendos/);
    assert.equal(await evaluate('document.querySelector("#proforma-pending details").open'),false);
    let issues=await evaluate('(()=>{let r=FinoraProforma.analyze(FinoraCasos.store.active(),FinoraProforma.settingsFor(FinoraCasos.store.active()));return [...new Set([...r.issues,...r.income.issues])].length})()');
    assert.equal(await evaluate('document.querySelectorAll("#proforma-pending li").length'),issues);
    assert.doesNotMatch(await content('proforma-pending'),/1000000000000000/);
    await evaluate('document.querySelector("#proforma-pending details").open=true');await fill('[data-setting=salesValue]',-101);
    assert.ok(await evaluate('document.querySelector("#proforma-pending details").open'));assert.match(await content('proforma-pending'),/desde -100 hasta el límite/);
    await click('#tab-balance');assert.equal(await evaluate('document.getElementById("balance-pending-message").hidden'),false);assert.match(await content('proforma-pending'),/Balance proforma sin preparar/);
    for(const width of [1440,390])for(const mode of ['off','on']){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);await evaluate(`document.documentElement.dataset.presentation=${JSON.stringify(mode)}`);
      await click('#tab-income');await evaluate('document.getElementById("income-pending-message").scrollIntoView({block:"center"})');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
      assert.ok(await evaluate('document.getElementById("income-pending-message").getClientRects().length>0'));
      await shot('pendientes-'+width+'-'+mode);
    }
    await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);assert.ok(await evaluate('document.getElementById("income-pending-message").getClientRects().length>0'));await send('Emulation.setEmulatedMedia',{media:'screen'},sessionId);
    c.params.proforma=s;await evaluate(`FinoraCasos.store.add(${JSON.stringify(c)})`);await until('document.getElementById("paper-badge-status").textContent.includes("PROYECCIÓN HISTÓRICA")');
    assert.equal(await evaluate('document.getElementById("income-pending-message").hidden'),true);assert.equal(await content('proforma-pending'),'');assert.match(await content('income-proforma-body'),/15,120\.00/);
    await click('#tab-balance');assert.equal(await evaluate('document.getElementById("balance-pending-message").hidden'),true);assert.equal(await content('proforma-pending'),'');assert.match(await content('balance-proforma-body'),/2,920\.00/);
    assert.deepEqual(errors,[]);console.log('OK: agrupación y detalle completo, límites legibles, estado pendiente por informe, recálculo, cifras completas conocidas, impresión y 1440/390 en ambos temas.');screenshots.forEach(file=>console.log(file));
  }finally{await send('Browser.close').catch(()=>browser.kill());await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
