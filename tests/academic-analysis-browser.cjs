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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-academic-ui-'));
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
  const C=require('../assets/js/casos.js'),P=require('../assets/js/paste-import.js'),X=require('../assets/vendor/sheetjs/xlsx.full.min.js');
  const workbook=process.env.FINORA_ACADEMIC_XLSX;if(!workbook||!fs.existsSync(workbook))throw Error('Indica FINORA_ACADEMIC_XLSX.');
  const book=X.read(fs.readFileSync(workbook),{type:'buffer'});let company=C.blankCase('Comercial La Cosecha');
  for(const [name,kind] of [['Balance General','balance'],['Estado de Resultados','income']]){const rows=X.utils.sheet_to_json(book.Sheets[name],{header:1,defval:''}).slice(3).filter(r=>r[0]&&!String(r[0]).startsWith('CUENTA /')&&!r[0].includes('= saldo')&&!r[0].startsWith('Los importes'));const d=P.analyze(['Cuenta\t2024\t2025',...rows.map(r=>r.slice(0,3).join('\t'))].join('\n'),{kind});d.rows.forEach(row=>row.confirmed=true);company=P.buildCase(company,d);}
  try{
    await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await send('Page.navigate',{url:base+'/modulos/analisis-financiero/index.html'},sessionId);await until('!!window.FinoraAcademicAnalysis');await evaluate(`FinoraCasos.store.add(${JSON.stringify(company)})`);
    await click('#tab-income');assert.match(await content('panel-income'),/141,400\.00/);
    await click('#tab-ratios');assert.match(await content('panel-ratios'),/Ciclo de Conversión de Efectivo/);assert.match(await content('panel-ratios'),/CCE = inventario \+ cobro − pago: pendiente/);
    assert.match(await content('panel-ratios'),/Dividendos totales informados:\s*C\$\s*45,000\.00/);
    assert.match(await content('panel-ratios'),/Cambio entre balances:\s*C\$\s*96,400\.00/);
    assert.match(await content('panel-ratios'),/Incremento reportado:\s*C\$\s*96,400\.00/);
    const margin=await evaluate(`Array.from(document.querySelectorAll('.ratio-table tbody tr')).find(r=>r.cells[0]?.textContent==='Margen neto')?.cells[3]?.textContent`);
    assert.equal(margin,'—');
    await fill('[name=creditSales]',1200000);await fill('[name=purchaseRate]',70);await evaluate('document.getElementById("cce-premises").requestSubmit()');
    assert.match(await content('panel-ratios'),/CCE = inventario \+ cobro − pago: 38\.96 días/);assert.match(await content('panel-ratios'),/No se puede comparar/);
    for(const expected of ['101.39 días','42.58 días','105.01 días'])assert.ok((await content('panel-ratios')).includes(expected),expected);
    for(const [label,expected] of [['Razón circulante','1.89 veces'],['Prueba ácida','1.22 veces'],['Razón de deuda','52.73%'],['Cobertura de intereses','12.22 veces'],['Rotación de inventario','3.60 veces']]){
      const row=await evaluate(`Array.from(document.querySelectorAll('.ratio-table tbody tr')).find(r=>r.cells[0]?.textContent===${JSON.stringify(label)})?.textContent`);
      assert.ok(row?.includes(expected),label+': '+row);
    }
    const after=await active();assert.deepEqual(after.balance,company.balance);assert.deepEqual(after.income,company.income);assert.deepEqual(after.reported,company.reported);
    await send('Page.reload',{},sessionId);await until('!!document.getElementById("cce-premises")');assert.equal(await evaluate('document.querySelector("[name=creditSales]").value'),'1200000');
    for(const width of [1440,390])for(const mode of ['off','on']){await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false},sessionId);await evaluate(`document.documentElement.dataset.presentation=${JSON.stringify(mode)};document.querySelector('.cce-chart').scrollIntoView({block:'center'})`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);await shot('cce-'+width+'-'+mode);}
    await fill('[name=purchaseRate]',1);await evaluate('document.getElementById("cce-premises").requestSubmit()');assert.match(await content('panel-ratios'),/ciclo es negativo/i);assert.match(await content('panel-ratios'),/pago: −/);
    await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);assert.ok(await evaluate('document.querySelector(".cce-chart").getClientRects().length>0'));
    assert.deepEqual(errors,[]);console.log('OK: Excel 2024–2025, CCE y retenidas, premisas editables, recalculado negativo, recarga, datos históricos intactos, móvil/escritorio, modos e impresión.');screenshots.forEach(f=>console.log(f));
  }finally{await send('Browser.close').catch(()=>browser.kill());await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
