'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.FINORA_PLAYWRIGHT||'playwright');
const C=require('../assets/js/casos.js'),B=require('../assets/js/budget.js'),P=require('../assets/js/proforma.js');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':(type[path.extname(file)]||'application/octet-stream')+'; charset=utf-8'}).end(data);
  });
});
function fixture(){
  const c=C.blankCase('Empresa de verificación');c.currency='C$';c.scale='en miles';
  const s=B.newProjection(c);s.name='Control octubre';s.config={frequency:'monthly',start:'2026-10-01',count:1};
  Object.assign(s.products[0],{initialUnits:0,initialValue:0,inventoryMode:'manual',values:{'2026-10':{units:300,price:1000,unitCost:600,targetUnits:0}}});
  s.expenses=[{id:'fixed',label:'Administración',category:'administration',mode:'manual',values:{'2026-10':70000}}];
  Object.assign(s.result,{taxMode:'none',interestMode:'manual',interest:{'2026-10':10000},otherEnabled:true,otherIncome:{'2026-10':15000},otherExpenses:{'2026-10':5000}});
  const saved=B.saveProjection(c,s);
  saved.income=[['sales',300000],['costSales',180000],['opex',70000],['interest',10000],['otherIncome',10000],['taxes',0]].map(([category,value])=>({id:category,name:category,category,sign:1,amounts:{previous:value,current:value}}));
  const pro=P.newProjection(saved);Object.assign(pro,{name:'Control octubre',start:'2026-10-01',end:'2026-10-31',method:'mixed',salesValue:0,dividends:0,lines:{costSales:{fixedPercent:0},opex:{fixedPercent:100}}});
  return P.saveProjection(saved,pro);
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port, errors=[];
  const executablePath=process.env.FINORA_BROWSER_PATH||[chromium.executablePath(),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    const pro=await context.newPage();await pro.goto(base+'/modulos/proforma/index.html');
    const c=fixture();await pro.evaluate(data=>FinoraCasos.store.add(data),c);
    assert.equal(await pro.locator('#proforma-gao-val').textContent(),'2.40 veces');
    assert.equal(await pro.locator('#proforma-gaf-val').textContent(),'1.00 veces');
    assert.equal(await pro.locator('#paper-currency').textContent(),'Cifras en C$ en miles');
    const lev=await context.newPage();await lev.goto(base+'/modulos/apalancamiento/index.html?source=proforma');
    for(const k of ['gao','gaf','gat'])assert.equal(await lev.locator('#'+k+'-val').textContent(),await pro.locator('#proforma-'+k+'-val').textContent());
    assert.match(await lev.locator('#scenario-description').textContent(),/50,000.00/);
    await lev.click('[data-scenario="higher"]');assert.match(await lev.locator('#scenario-description').textContent(),/62,000.00/);
    assert.equal(await lev.locator('#leverage-currency-caption').textContent(),await pro.locator('#paper-currency').textContent());
    assert.equal(await lev.locator('#leverage-projection-name').textContent(),'Control octubre');
    console.log('OK: coincidencia entre módulos, moneda/escala y escenario con otros resultados.');
    for(const [page,selectors] of [[lev,['.source-button','.leverage-formula strong','.scenario-assumption','.leverage-breakdown dt','.leverage-links a']],
      [pro,['.paper-status','.paper-wordmark>span','.paper-footer','.proforma-leverage-metric small','.proforma-leverage-metric strong','.report-type strong']]]){
      for(const width of [1440,390])for(const mode of ['on','off']){
        await page.bringToFront();
        await page.setViewportSize({width,height:1000});
        await page.evaluate(m=>localStorage.setItem('finora:presentation:v1',m),mode);
        await page.reload();
        await page.evaluate(()=>document.fonts.ready);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const result=await page.evaluate(selectors=>{
          const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
          const lum=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);}).reduce((t,v,i)=>t+v*[.2126,.7152,.0722][i],0);
          const bad=[];
          for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
            if(!el.getClientRects().length)continue;
            const style=getComputedStyle(el);
            if(parseFloat(style.fontSize)<11)bad.push(selector+' texto menor que 11px');
            let parent=el,bg=[255,255,255];
            while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}parent=parent.parentElement;}
            const a=lum(rgb(style.color)),b=lum(bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
            if(contrast<4.5)bad.push(selector+' contraste '+contrast.toFixed(2));
          }
          return {overflow:document.documentElement.scrollWidth>innerWidth+1,bad};
        },selectors);
        assert.deepEqual(result,{overflow:false,bad:[]},page.url()+' '+width+' '+mode+' '+JSON.stringify(result));
      }
    }
    console.log('OK: móvil/escritorio, claro/oscuro, textos >=11px, contraste de textos clave y sin desbordamiento.');
    await pro.emulateMedia({media:'print'});
    assert.equal(await pro.locator('#report-income').isVisible(),true);assert.equal(await pro.locator('#report-balance').isVisible(),false);
    await pro.emulateMedia({media:'screen'});
    await pro.evaluate(()=>{const C=FinoraCasos,c=C.store.active();c.params.proforma.salesValue=100;C.store.save(c);});
    await lev.waitForFunction(()=>document.getElementById('bd-sales').textContent.includes('600,000'));
    assert.equal(await lev.locator('#gao-val').textContent(),await pro.locator('#proforma-gao-val').textContent());
    console.log('OK: actualización entre pestañas e informe seleccionado en impresión.');
    await pro.evaluate(()=>{const C=FinoraCasos,c=C.store.active();c.income.find(a=>a.category==='interest').amounts.current=null;C.store.save(c);});
    await lev.waitForFunction(()=>document.getElementById('gao-val').textContent==='—');
    assert.equal(await lev.locator('#sales-change').textContent(),'—');
    assert.equal(await lev.locator('#sales-bar').evaluate(e=>e.style.width),'0%');
    assert.equal(await lev.locator('[data-scenario="higher"]').isDisabled(),true);
    assert.equal(await pro.locator('#proforma-gaf-val').textContent(),'—');
    await pro.evaluate(()=>{const C=FinoraCasos,c=C.store.active();c.params.budget.mode='cash';c.income.find(a=>a.category==='interest').amounts.current=10000;C.store.save(c);});
    await lev.waitForFunction(()=>document.getElementById('gao-val').textContent!=='—');
    assert.equal(await pro.locator('#proforma-data-source').textContent(),'Históricos conectados');
    assert.match(await pro.locator('#income-proforma-body').textContent(),/600,000/);
    await pro.click('[data-report="balance"]');assert.match(await pro.locator('#balance-equation-msg').textContent(),/Completa las premisas/);
    await pro.evaluate(()=>FinoraCasos.store.create('Empresa sin datos'));
    await lev.waitForFunction(()=>document.getElementById('leverage-mode-badge').textContent.includes('Empresa sin datos'));
    await lev.click('[data-source="historical"]');assert.equal(await lev.locator('#gao-val').textContent(),'—');
    assert.deepEqual(errors,[]);
    console.log('OK: pendientes limpian cifras y barras, caja independiente, cambio de empresa, sin errores JavaScript.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
