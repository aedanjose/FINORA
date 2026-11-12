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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-backup-ui-'));
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
  const B=require('../assets/js/backup.js'),P=require('../assets/js/personal-budget.js'),A=require('../assets/js/fixed-assets.js');
  const upload=async file=>{const {root:doc}=await send('DOM.getDocument',{},sessionId);const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#backup-file'},sessionId);await send('DOM.setFileInputFiles',{nodeId,files:[file]},sessionId);};
  const open=async()=>{await click('#backup-open');await until('!!document.getElementById("backup-file") && !!window.FinoraBackup');};
  try{
    await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:profile},sessionId);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await send('Page.navigate',{url:base+'/modulos/dashboard/index.html'},sessionId);await until('!!document.getElementById("backup-open")');
    await evaluate(`localStorage.setItem('finora:personal-budget:v1',${JSON.stringify(JSON.stringify(P.blank()))});localStorage.setItem('finora:fixed-assets:v1',${JSON.stringify(JSON.stringify(A.blank(2026)))});FinoraCasos.store.setActive('dayton');localStorage.setItem('otra-clave','intacta')`);
    await open();const before=await evaluate('FinoraBackup.snapshot(localStorage)');
    for(const width of [1440,390])for(const mode of ['off','on']){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);await evaluate(`document.documentElement.dataset.presentation=${JSON.stringify(mode)}`);assert.ok(await evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth+1'));await shot(`respaldo-${width}-${mode}`);}
    await click('#backup-export');const limit=Date.now()+10000;let exported;while(!exported){exported=fs.readdirSync(profile).find(f=>/^finora-respaldo-.*\.json$/.test(f));if(Date.now()>limit)throw Error('No se descargó el respaldo');if(!exported)await new Promise(r=>setTimeout(r,100));}
    const pathExport=path.join(profile,exported),raw=fs.readFileSync(pathExport,'utf8');assert.deepEqual(B.parse(raw),before);
    const invalid=path.join(profile,'invalido.json');fs.writeFileSync(invalid,'{');await upload(invalid);await until('document.getElementById("backup-status").textContent.includes("JSON válido")');assert.equal(await evaluate('document.getElementById("backup-confirm").disabled'),true);assert.deepEqual(await evaluate('FinoraBackup.snapshot(localStorage)'),before);
    await upload(pathExport);await until('!document.getElementById("backup-confirm").disabled');assert.match(await content('backup-status'),/presupuesto personal.*activos/);await evaluate('document.querySelector("dialog").close()');assert.deepEqual(await evaluate('FinoraBackup.snapshot(localStorage)'),before);
    await open();await upload(pathExport);await until('!document.getElementById("backup-confirm").disabled');await evaluate('localStorage.setItem("finora:global_currency","USD")');await click('#backup-confirm');assert.match(await content('backup-status'),/cambiaron/);assert.equal(await evaluate('localStorage.getItem("finora:global_currency")'),'USD');
    await upload(pathExport);await until('!document.getElementById("backup-confirm").disabled');await click('#backup-confirm');await until('!!document.getElementById("backup-open") && !document.querySelector("dialog[open]")');
    assert.deepEqual(await evaluate('Object.fromEntries('+JSON.stringify(B.KEYS)+'.map(k=>[k,localStorage.getItem(k)]))'),before);assert.equal(await evaluate('localStorage.getItem("otra-clave")'),'intacta');assert.equal((await active()).id,'dayton');
    assert.deepEqual(errors,[]);console.log('OK: descarga real, validación, cancelación, conflicto, confirmación, restauración, persistencia y diseño claro/oscuro en escritorio/móvil.');screenshots.forEach(file=>console.log(file));
  }finally{await send('Browser.close').catch(()=>browser.kill());await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
