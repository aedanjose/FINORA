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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-mobile-ui-'));
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
  try {
    await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    for(const mode of ['off','on']) for(const width of [1440,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);
      await send('Page.navigate',{url:base+'/modulos/dashboard/index.html'},sessionId);await until('!!document.querySelector(".dash-first-run")');
      await evaluate(`document.documentElement.dataset.presentation=${JSON.stringify(mode)}`);
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const state=await evaluate(`(()=>{const $=s=>document.querySelector(s),rect=e=>{let r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scroll:e.scrollWidth,client:e.clientWidth}};return {viewport:innerWidth,body:document.documentElement.scrollWidth,breadcrumb:rect($('.breadcrumb-current')),sidebarShadow:getComputedStyle($('.sidebar')).boxShadow,caseBarOverflow:getComputedStyle($('.dash-company-row .case-bar')).overflow,label:rect($('.case-select-field .field-label')),button:rect($('#case-reset'))}})()`);
      assert.equal(state.body<=width+1,true,JSON.stringify(state));
      assert.equal(state.breadcrumb.scroll<=state.breadcrumb.client+1,true,JSON.stringify(state));
      if(width===390){assert.equal(state.sidebarShadow,'none');assert.equal(state.caseBarOverflow,'visible');assert.ok(state.label.left>=0 && state.button.left>=0,JSON.stringify(state));}
      await shot(`dashboard-${width}-${mode}`);
      if(width===390){await click('.menu-toggle');assert.ok(await evaluate('document.body.classList.contains("sidebar-open")'));assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".sidebar")).boxShadow'),'none');await evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');assert.equal(await evaluate('document.body.classList.contains("sidebar-open")'),false);}
    }
    await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar")).display'),'none');assert.ok(await evaluate('document.querySelector(".dash-funding").getClientRects().length>0'));
    await send('Emulation.setEmulatedMedia',{media:'screen'},sessionId);
    await send('Page.navigate',{url:base+'/modulos/bienvenida/index.html'},sessionId);await until('!!document.querySelector(".board-scene")');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const w=await evaluate(`({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,wide:Array.from(document.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>[e.className,e.getBoundingClientRect().right,getComputedStyle(e).overflowX])})`);assert.ok(w.html<=w.width+1,JSON.stringify(w));await shot('bienvenida-390');
    const htmlFiles=['index.html',...fs.readdirSync(path.join(root,'modulos'),{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(root,'modulos',d.name,'index.html'))).map(d=>'modulos/'+d.name+'/index.html')];
    for(const file of htmlFiles){const html=fs.readFileSync(path.join(root,file),'utf8'),match=html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/i);assert.ok(match,'Favicon '+file);assert.match(html,/<meta\s+name="theme-color"\s+content="#[\da-f]{6}"/i,file);const url=new URL(match[1],base+'/'+file);const response=await fetch(url);assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),/image\/svg\+xml/,file);assert.match(await response.text(),/<svg/);}
    assert.deepEqual(errors,[]);console.log('OK: barra, menú, recorte y bienvenida a 390/1440, claro/oscuro, impresión y favicon/metadatos en '+htmlFiles.length+' páginas.');screenshots.forEach(text=>console.log(text));
  } finally {await send('Browser.close').catch(()=>browser.kill());await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
