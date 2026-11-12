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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'finora-modules-ui-'));
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
  const modules = ['estados-financieros','analisis-financiero','punto-equilibrio','apalancamiento','origen-aplicacion','flujo-efectivo','planeacion-presupuestos','proforma','presupuesto-personal','levantamiento-activos','inventario'];
  const issues = [];
  const navigate = async mod => {
    await send('Page.navigate', { url: base + '/modulos/' + mod + '/index.html' }, sessionId);
    await until(`document.body?.dataset.page===${JSON.stringify(mod)} && document.querySelectorAll('.nav-item').length===12 && document.readyState==='complete'`);
  };
  const viewport = (width, mode) => send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId).then(() => evaluate(`document.documentElement.dataset.presentation=${JSON.stringify(mode)};scrollTo(0,0)`));
  const layout = async label => {
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const result = await evaluate(`(() => {
      const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
      const overflow=document.documentElement.scrollWidth>innerWidth+1;
      const small=Array.from(document.querySelectorAll('.page-title,.panel-title,.button,.input,.select,th,td,.nav-item')).filter(visible).filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).map(e=>e.className);
      const dialog=document.querySelector('dialog[open]');
      return {overflow,small,dialogOverflow:!!dialog && dialog.scrollWidth>dialog.clientWidth+2,
        ...(overflow?{wide:Array.from(document.querySelectorAll('main *')).filter(visible).filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,10).map(e=>[e.tagName,e.id,e.className,Math.round(e.getBoundingClientRect().width)])}:{})};
    })()`);
    if(result.overflow || result.small.length || result.dialogOverflow) issues.push({label,...result});
  };
  const upload = async (selector, file) => {
    const { root: doc } = await send('DOM.getDocument', {}, sessionId);
    const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector }, sessionId);
    await send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(file)] }, sessionId);
  };
  try {
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await viewport(1440, 'off');
    await navigate('estados-financieros');
    await evaluate(`FinoraCasos.store.add(${JSON.stringify(example)})`);
    for(const mod of modules) {
      await navigate(mod);
      assert.equal(await evaluate('document.documentElement.dataset.presentation'), 'off', mod+' inicia con el tema aprobado');
      const data = await evaluate('localStorage.getItem("finora:casos:v1")');
      assert.ok(await evaluate('Array.from(document.styleSheets).some(s=>s.href?.endsWith("/modules.css") && s.cssRules.length>0)'), mod+' carga los estilos comunes');
      for(const width of [1440, 1024, 760, 390]) for(const mode of ['off','on']) {
        await viewport(width, mode); await layout(mod+' '+width+' '+mode);
        if(width===1440 && mode==='off') await shot(mod);
        if(width===390 && mode==='off' && ['estados-financieros','proforma','presupuesto-personal'].includes(mod)) await shot(mod+'-movil');
      }
      if(mod==='origen-aplicacion') {
        const menu=await evaluate('Array.from(document.querySelectorAll(".nav-item")).map(el=>el.textContent.trim())');
        assert.equal(menu.indexOf('Origen y aplicación')+1,menu.indexOf('Flujo de efectivo'));
        assert.match(await content('sources-content'),/105,000\.00/); assert.match(await content('sources-content'),/90,000\.00/);
        assert.match(await content('sources-content'),/15,000\.00/); assert.match(await content('sources-content'),/financiamiento de proveedores/);
        assert.equal(await evaluate('document.querySelectorAll(".sources-grid table").length'),2);
        assert.match(await content('sources-content'),/Aumento observado del efectivo/);
        assert.match(await content('sources-content'),/Total ajustado orígenes/);assert.match(await content('sources-content'),/Total ajustado aplicaciones/);
        assert.match(await content('sources-content'),/Cuadrado/);assert.match(await content('sources-content'),/no son verificaciones independientes/);
        const company=await active();
        await evaluate('(()=>{const c=FinoraCasos.store.active();c.balance.find(a=>a.role==="cash").amounts.previous=null;FinoraCasos.store.save(c)})()');
        assert.match(await content('sources-content'),/Información insuficiente/);assert.match(await content('sources-content'),/105,000\.00/);
        assert.match(await content('sources-content'),/variación explicada\):\s*C\$ 15,000\.00/i);
        await evaluate(`FinoraCasos.store.save(${JSON.stringify(company)})`);
        await evaluate('(()=>{const c=FinoraCasos.store.active(),gross=c.balance.find(a=>/planta y equipo/.test(a.name)),contra=c.balance.find(a=>a.sign===-1);c.params.cashFlow={periodKey:FinoraCashFlow.periodKey(c),allocations:{[gross.id]:"ignore",[contra.id]:"operating"}};FinoraCasos.store.save(c)})()');
        assert.match(await content('sources-content'),/Información insuficiente/);assert.match(await content('sources-content'),/no tiene una compensación identificada/);
        await evaluate(`FinoraCasos.store.save(${JSON.stringify(company)})`);
        await evaluate('(()=>{const c=FinoraCasos.store.active();c.balance.find(a=>a.role==="cash").amounts.current=75000;c.balance.find(a=>a.name==="Capital aportado").amounts.current=115000;FinoraCasos.store.save(c)})()');
        assert.match(await content('sources-content'),/Disminución observado del efectivo|Disminución observada del efectivo/);
        assert.match(await content('sources-content'),/115,000\.00/);
        await evaluate(`FinoraCasos.store.save(${JSON.stringify(company)})`);
        await evaluate('(()=>{const c=FinoraCasos.store.active();c.params.cashFlow={periodKey:FinoraCashFlow.periodKey(c),investingOverride:-42000};FinoraCasos.store.save(c)})()');
        assert.match(await content('sources-content'),/Descuadrado/);assert.match(await content('sources-content'),/−C\$ 2,000\.00/);
        assert.equal(await evaluate('document.querySelector(".sources-status a").getAttribute("href")'),'../flujo-efectivo/index.html');
        await evaluate(`FinoraCasos.store.save(${JSON.stringify(company)})`);
        await viewport(1440,'off');await click('.heading-actions a.button-primary');
        await until('document.body?.dataset.page==="flujo-efectivo" && !!document.getElementById("cash-net")');
        assert.match(await content('cash-net'),/15,000\.00/);
        await navigate(mod);
      }
      if(mod==='apalancamiento') {
        for(const mode of ['off','on']) {
          await viewport(1440,mode);
          const contrast=await evaluate(`(() => {
            const card=document.querySelector('.total-leverage');
            const luminance=color=>{const rgb=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
            const bg=luminance(getComputedStyle(card).backgroundColor);
            return Array.from(card.querySelectorAll('h2,p,.leverage-code,.leverage-formula span,.leverage-formula strong,.button')).map(e=>{const fg=luminance(getComputedStyle(e).color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)});
          })()`);
          assert.ok(contrast.every(value=>value>=4.5),'Contraste de tarjeta GAT '+mode+': '+contrast.join(', '));
          await shot('apalancamiento-'+mode);
        }
      }
      if(['analisis-financiero','estados-financieros','planeacion-presupuestos'].includes(mod)) {
        const selector=mod==='planeacion-presupuestos'?'.budget-steps button':'[role="tab"]';
        const count=await evaluate(`document.querySelectorAll('${selector}').length`);
        for(let i=0;i<count;i++) {
          await evaluate(`document.querySelectorAll('${selector}')[${i}].click()`);
          for(const width of [1440,390]) for(const mode of ['off','on']) { await viewport(width,mode); await layout(mod+' pestaña '+i+' '+width+' '+mode); }
        }
        await evaluate(`document.querySelector('${selector}').click()`);
      }
      if(mod==='proforma') {
        await evaluate('document.querySelectorAll("#proforma-assumptions details").forEach(el=>el.open=true)');
        for(const mode of ['off','on']) { await viewport(390,mode); await layout('proforma premisas abiertas '+mode); }
        await viewport(1440,'off'); await evaluate('document.getElementById("proforma-assumptions").scrollIntoView({block:"start"})'); await shot('premisas-proforma');
        assert.equal(await evaluate('document.querySelectorAll(".paper-brand svg rect").length'),3);
        await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);
        const printStyle=()=>evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.report-paper,.statement-table,.statement-total')).map(el=>{const s=getComputedStyle(el);return [s.display,s.fontSize,s.backgroundColor,s.color,s.padding]}))`);
        const printed=await printStyle();
        await evaluate('Array.from(document.styleSheets).find(s=>s.href?.endsWith("/modules.css")).disabled=true');
        assert.equal(await printStyle(),printed,'La capa visual conserva los estilos de impresión');
        await evaluate('Array.from(document.styleSheets).find(s=>s.href?.endsWith("/modules.css")).disabled=false');
        await send('Emulation.setEmulatedMedia',{media:'screen'},sessionId);
      }
      assert.equal(await evaluate('localStorage.getItem("finora:casos:v1")'),data,mod+' conserva datos al cambiar presentación');
      await viewport(1440, 'off');
      if(mod==='presupuesto-personal') { await click('#add-personal-movement'); await evaluate('document.getElementById("personal-form").scrollIntoView({block:"center"})'); await shot('formulario-personal'); }
      if(mod==='planeacion-presupuestos') { await click('[data-action="import"]'); await layout('importar presupuesto escritorio'); await shot('importar-presupuesto'); await viewport(390,'off'); await layout('importar presupuesto móvil'); }
    }
    await viewport(1440,'off'); await navigate('estados-financieros');
    const beforeImport=await active();
    await click('#upload-excel'); await shot('importar-estados');
    await upload('#financial-file', path.join(__dirname,'fixtures','libro-practica.xlsx'));
    await until('!!document.getElementById("detect-review")');
    await shot('deteccion-estados'); await click('#detect-review');
    await until('!!document.querySelector("#import-workspace .import-table")');
    await shot('revision-estados');
    for(const mode of ['off','on']) { await viewport(390,mode); await layout('revisión estados móvil '+mode); await shot('revision-estados-movil-'+mode); }
    await click('[data-import-action="cancel"]'); assert.deepEqual(await active(),beforeImport,'Revisar y cancelar no modifica la empresa');
    for(const entry of [
      {mod:'presupuesto-personal',selector:'#personal-import-file',file:process.env.FINORA_PERSONAL_XLSX,ready:'#personal-import-confirm',preview:'#personal-import-preview'},
      {mod:'levantamiento-activos',selector:'#assets-file',file:process.env.FINORA_ASSETS_XLSX,ready:'#assets-import-confirm',preview:'#assets-preview'}
    ]) {
      assert.ok(entry.file && fs.existsSync(entry.file),'Archivo de prueba '+entry.mod);
      await viewport(1440,'off'); await navigate(entry.mod); await upload(entry.selector,entry.file);
      await until(`!document.querySelector(${JSON.stringify(entry.ready)}).disabled && !document.querySelector(${JSON.stringify(entry.preview)}).hidden`);
      await evaluate(`document.querySelector(${JSON.stringify(entry.preview)}).scrollIntoView({block:'start'})`); await shot(entry.mod+'-importar');
      for(const mode of ['off','on']) { await viewport(390,mode); await layout(entry.mod+' vista previa '+mode); }
      await click(entry.ready);
      await viewport(1440,'off'); await shot(entry.mod+'-datos');
      await viewport(390,'off'); await layout(entry.mod+' importado móvil'); await shot(entry.mod+'-datos-movil');
      await viewport(1440,'on'); await shot(entry.mod+'-exposicion');
    }
    await navigate('analisis-financiero'); await click('.presentation-toggle');
    await send('Page.reload',{},sessionId); await until('document.readyState==="complete" && !!document.querySelector(".nav-item")');
    assert.equal(await evaluate('document.documentElement.dataset.presentation'),'on','Preferencia de exposición conservada tras recarga');
    await send('Page.navigate',{url:base+'/modulos/bienvenida/index.html'},sessionId); await until('!!document.querySelector("[data-enter]")');
    assert.match(await evaluate('document.querySelector(".brand").textContent'),/FINORA/);
    assert.equal(await evaluate('document.querySelectorAll(".brand-mark rect").length'),3);
    console.log('Capturas: '+profile);
    assert.deepEqual(errors,[], 'Errores de JavaScript');
    assert.deepEqual(issues,[], 'Diseño adaptable');
    console.log('OK: 11 módulos, 4 anchos, 2 temas, datos intactos, formularios, Excel financiero/personal/activos, revisión y cancelación, tema persistente e identidad de bienvenida.');
  } finally { await send('Browser.close').catch(() => browser.kill()); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
