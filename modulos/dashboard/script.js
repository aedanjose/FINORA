/* Dashboard de lectura y escenarios; las cifras observadas siguen viniendo de los estados. */
(() => {
  'use strict';
  const C=window.FinoraCasos,D=window.FinoraDashboard,{esc}=window.FinoraCaseBar;
  const content=document.getElementById('dashboard-content'),finite=Number.isFinite;
  let c,data,basis,chartKind='income',projectionMetric='sales';
  const money=v=>C.fmt.money(v,c),pct=v=>C.fmt.pct(v,1);
  const signed=v=>finite(v)?(v>0?'+':'')+money(v):'—';
  const short=v=>finite(v)?(v<0?'−':'')+new Intl.NumberFormat('es',{notation:'compact',maximumFractionDigits:1}).format(Math.abs(v)):'—';
  const number=v=>finite(v)?v.toLocaleString('en-US',{maximumFractionDigits:2}):'';
  const panel=(title,subtitle,body,extra='',cls='')=>`<article class="panel dash-panel ${cls}"><div class="panel-header"><div><h2 class="panel-title">${title}</h2><p class="panel-subtitle">${subtitle}</p></div>${extra}</div>${body}</article>`;
  const noData=message=>`<div class="dash-no-data"><i data-icon="chart"></i><p>${message}</p><a class="link" href="../estados-financieros/index.html">Completar estados →</a></div>`;
  const variation=key=>{
    const v=data.changes[key];
    if(finite(v.relative))return `<span class="dash-change ${v.relative<0?'dash-negative':'dash-positive'}">${v.relative>0?'↗':v.relative<0?'↘':'→'} ${C.fmt.signedPct(v.relative,1)}</span><span>vs. ${esc(c.periods.previous)}</span>`;
    return `<span>${finite(v.absolute)?'Cambio: '+esc(signed(v.absolute)): 'Sin base comparable'}</span>`;
  };
  function combinedComparison(){
    const series=data.series.income,sides=['previous','current'],values=series.flatMap(row=>sides.map(side=>row[side])).filter(finite);
    if(!values.length)return noData('Completa el estado de resultados para comparar ventas, costos, gastos y utilidad.');
    const high=Math.max(0,...values),low=Math.min(0,...values),span=high-low||1,top=high+span*.16,bottom=low<0?low-span*.12:0;
    const y=value=>36+(top-value)/(top-bottom)*240,centers=[245,565],width=46,gap=8;
    const colors=['var(--dash-income)','var(--dash-cost)','var(--dash-expense)'],titles=['Ventas','Costo de ventas','Gastos operativos'];
    const legend=`<div class="dash-combined-meta"><div class="dash-legend">${titles.map((label,i)=>`<span><b class="dash-dot" style="background:${colors[i]}"></b>${label}</span>`).join('')}<span><b class="dash-line-key dash-profit-key"></b>Utilidad neta</span></div><span class="dash-chart-unit">${esc(C.fmt.unit(c))}</span></div>`;
    const bars=sides.map((side,i)=>series.slice(0,3).map((row,j)=>{
      const value=row[side];if(!finite(value))return '';const x=centers[i]+(j-1)*(width+gap)-width/2,label=`${row.label} · ${c.periods[side]}: ${money(value)}`;
      return `<rect class="dash-bar" tabindex="0" role="img" aria-label="${esc(label)}" data-chart-label="${esc(label)}" data-chart-series="${j}" x="${x}" y="${Math.min(y(0),y(value))}" width="${width}" height="${Math.abs(y(value)-y(0))}" rx="6" fill="${colors[j]}"><title>${esc(label)}</title></rect><text class="dash-bar-value" x="${x+width/2}" y="${value>=0?y(value)-12:y(value)+21}" text-anchor="middle">${short(value)}</text>`;
    }).join('')).join('');
    const profit=series[3],line=sides.every(side=>finite(profit[side]))?`<path class="dash-profit-line" d="M${centers[0]} ${y(profit.previous)} L${centers[1]} ${y(profit.current)}"/>`:'';
    const points=sides.map((side,i)=>{
      const value=profit[side];if(!finite(value))return '';const label=`${profit.label} · ${c.periods[side]}: ${money(value)}`;
      return `<circle class="dash-profit-point" tabindex="0" role="img" aria-label="${esc(label)}" data-chart-label="${esc(label)}" cx="${centers[i]}" cy="${y(value)}" r="6"><title>${esc(label)}</title></circle><rect class="dash-profit-tag" x="${centers[i]+85}" y="${y(value)-12}" width="86" height="24" rx="5"/><text class="dash-profit-value" x="${centers[i]+128}" y="${y(value)+5}" text-anchor="middle">${short(value)}</text>`;
    }).join('');
    const ticks=high===low?[0]:Array.from({length:5},(_,i)=>low+(high-low)*i/4);
    return `${legend}<div class="dash-chart-wrap"><svg class="dash-comparison dash-combined" viewBox="0 0 800 340" role="img" aria-labelledby="comparison-title"><title id="comparison-title">Ventas, costo de ventas, gastos operativos y utilidad neta de ${esc(c.periods.previous)} y ${esc(c.periods.current)}. Cifras en ${esc(C.fmt.unit(c))}.</title>${ticks.map(value=>`<line class="dash-grid-line" x1="90" x2="758" y1="${y(value)}" y2="${y(value)}"/><text class="dash-axis" x="78" y="${y(value)+5}" text-anchor="end">${short(value)}</text>`).join('')}<line class="dash-zero" x1="90" x2="758" y1="${y(0)}" y2="${y(0)}"/>${bars}${line}${points}${sides.map((side,i)=>`<text class="dash-axis dash-group-label" x="${centers[i]}" y="311" text-anchor="middle">${esc(c.periods[side])}</text>`).join('')}<text class="dash-axis dash-axis-caption" x="758" y="333" text-anchor="end">Período observado</text></svg><div class="dash-tooltip" id="dashboard-tooltip" role="status" hidden></div></div><details class="dash-chart-data"><summary>Ver cifras y partidas del gráfico</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Concepto</th><th>${esc(c.periods.previous)}</th><th>${esc(c.periods.current)}</th></tr></thead><tbody>${series.map(row=>`<tr><td>${esc(row.label)}</td><td>${esc(money(row.previous))}</td><td>${esc(money(row.current))}</td></tr>`).join('')}</tbody></table></div><p class="dash-chart-note">Las partidas se muestran por separado. La utilidad neta también considera los demás ingresos, intereses e impuestos del estado de resultados.</p></details>`;
  }
  function comparison(){
    if(chartKind==='income')return combinedComparison();
    const series=data.series[chartKind],all=series.flatMap(row=>[row.previous,row.current]).filter(finite);
    if(!all.length)return noData('Los gráficos se completarán con las cuentas de tu documento.');
    const hi=Math.max(0,...all),lo=Math.min(0,...all),span=hi-lo||1,upper=hi+span*.18,lower=lo-span*.07;
    const y=v=>30+(upper-v)/(upper-lower)*222,step=620/series.length,start=65,bw=Math.min(45,step*.24);
    const grid=hi===lo?[0]:Array.from({length:5},(_,i)=>lo+(hi-lo)*i/4);
    return `<div class="dash-chart-wrap"><svg class="dash-comparison" viewBox="0 0 740 318" role="img" aria-labelledby="comparison-title"><title id="comparison-title">Comparación de ${esc(c.periods.previous)} y ${esc(c.periods.current)}. Cifras en ${esc(C.fmt.unit(c))}.</title>${grid.map(v=>`<line class="dash-grid-line" x1="60" x2="705" y1="${y(v)}" y2="${y(v)}"/><text class="dash-axis" x="50" y="${y(v)+4}" text-anchor="end">${short(v)}</text>`).join('')}<line class="dash-zero" x1="60" x2="705" y1="${y(0)}" y2="${y(0)}"/>${series.map((row,i)=>['previous','current'].map((side,j)=>{
      const value=row[side];if(!finite(value))return '';const x=start+i*step+step/2+(j?5:-bw-5),label=`${row.label} · ${c.periods[side]}: ${money(value)}`;
      return `<rect class="dash-bar" tabindex="0" role="img" aria-label="${esc(label)}" data-chart-label="${esc(label)}" x="${x}" y="${Math.min(y(0),y(value))}" width="${bw}" height="${Math.max(2,Math.abs(y(value)-y(0)))}" rx="5" fill="${j?'var(--dash-teal)':'var(--dash-prior)'}"><title>${esc(label)}</title></rect><text class="dash-bar-value" x="${x+bw/2}" y="${value>=0?y(value)-10:y(value)+16}" text-anchor="middle">${short(value)}</text>`;
    }).join('')+`<text class="dash-axis dash-group-label" x="${start+i*step+step/2}" y="291" text-anchor="middle">${esc(row.label)}</text>`).join('')}</svg><div class="dash-tooltip" id="dashboard-tooltip" role="status" hidden></div></div><details class="dash-chart-data"><summary>Ver cifras del gráfico</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Concepto</th><th>${esc(c.periods.previous)}</th><th>${esc(c.periods.current)}</th></tr></thead><tbody>${series.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc(money(r.previous))}</td><td>${esc(money(r.current))}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function funding(){
    const {liabilities,equity,assets}=data.composition,valid=finite(liabilities)&&finite(equity)&&liabilities>=0&&equity>=0&&liabilities+equity>0;
    const share=valid?liabilities/(liabilities+equity):null,circ=2*Math.PI*76;
    const donut=valid?`<div class="dash-donut"><svg viewBox="0 0 240 220" role="img" aria-label="Pasivos ${esc(pct(share))} y patrimonio ${esc(pct(1-share))} del financiamiento"><circle class="dash-donut-track" cx="120" cy="106" r="76"/><circle cx="120" cy="106" r="76" fill="none" stroke="var(--dash-teal)" stroke-width="21"/><circle cx="120" cy="106" r="76" fill="none" stroke="var(--dash-violet)" stroke-width="21" stroke-dasharray="${circ*share} ${circ}" transform="rotate(-90 120 106)"/><text class="dash-donut-value" x="120" y="104" text-anchor="middle">${pct(share)}</text><text class="dash-donut-caption" x="120" y="126" text-anchor="middle">Pasivos / financiamiento</text></svg></div>`:noData(finite(equity)&&equity<0?'El patrimonio es negativo. Revisa su composición en los estados.':'Completa pasivo y patrimonio para ver su composición.');
    return `${donut}<div class="dash-funding-legend"><div><span><b class="dash-dot dash-violet"></b>Pasivos</span><strong>${esc(money(liabilities))}</strong></div><div><span><b class="dash-dot dash-teal"></b>Patrimonio</span><strong>${esc(money(equity))}</strong></div></div><div class="dash-funding-base"><span>Total de activos</span><strong>${esc(money(assets))}</strong></div><div class="dash-debt-caption"><span>Pasivo / activo</span><strong>${esc(pct(data.debtRatio.current))}</strong><small>${finite(data.debtRatio.current)&&finite(data.debtRatio.previous)?`${C.fmt.pp(data.debtRatio.current-data.debtRatio.previous,1)} vs. ${esc(c.periods.previous)}`:'Completa ambos años para comparar.'}</small></div>`;
  }
  function cceCardHTML(){
    let r=null, a=null, m=null;
    try {
      if(window.FinoraAcademicAnalysis?.analyze) {
        r = window.FinoraAcademicAnalysis.analyze(c);
        a = r?.current?.activity;
        m = a?.metrics;
      }
    } catch(_) {}
    const invDays = m?.inventoryDays?.value;
    const colDays = m?.collectionDays?.value;
    const payDays = m?.paymentDays?.value;
    const cce = a?.cce;
    const valid = finite(cce) && finite(invDays) && finite(colDays) && finite(payDays);

    if(!valid) {
      const anyDays = [invDays, colDays, payDays].some(finite);
      return `<div class="dash-cce-card dash-cce-empty">
        <div class="dash-cce-head">
          <div>
            <span class="dash-cce-kpi-label">Ciclo de Conversión de Efectivo</span>
            <div class="dash-cce-val-row"><strong class="dash-cce-val muted">—</strong><span class="dash-cce-unit">días</span></div>
          </div>
          <span class="dash-cce-badge badge-neutral">Datos pendientes</span>
        </div>
        <p class="dash-cce-note">${anyDays?'Completa las premisas de ventas y compras a crédito en Análisis Financiero para calcular el CCE exacto.':'Requiere inventario, cuentas por cobrar, cuentas por pagar y estado de resultados.'}</p>
        <div class="dash-cce-chips">
          <span class="dash-cce-chip"><span>Inventario</span><strong>${finite(invDays)?number(invDays)+' d':'—'}</strong></span>
          <span class="dash-cce-chip"><span>Cobro</span><strong>${finite(colDays)?number(colDays)+' d':'—'}</strong></span>
          <span class="dash-cce-chip"><span>Pago</span><strong>${finite(payDays)?number(payDays)+' d':'—'}</strong></span>
        </div>
        <a class="dash-cce-action" href="../analisis-financiero/index.html?tab=ratios#cce">Configurar premisas CCE <i data-icon="arrow-right"></i></a>
      </div>`;
    }

    const operatingCycle = invDays + colDays;
    const maxDays = Math.max(operatingCycle, payDays, 1);
    const ocPct = Math.min(100, Math.max(0, (operatingCycle / maxDays) * 100));
    const payPct = Math.min(100, Math.max(0, (payDays / maxDays) * 100));
    const gapStart = Math.min(payPct, ocPct);
    const gapWidth = Math.abs(ocPct - payPct);

    let stateClass = 'cce-gap', badgeClass = 'badge-amber', badgeText = 'Requiere financiamiento';
    let interpText = `La empresa necesita financiar ${number(cce)} días entre el pago a proveedores y el cobro.`;
    if(cce < 0) {
      stateClass = 'cce-surplus';
      badgeClass = 'badge-green';
      badgeText = 'Autofinanciamiento';
      interpText = `Los proveedores financian la operación: se cobra ${number(Math.abs(cce))} días antes de pagar.`;
    } else if(Math.abs(cce) < 0.01) {
      stateClass = 'cce-balanced';
      badgeClass = 'badge-blue';
      badgeText = 'Equilibrio exacto';
      interpText = 'Cobros y pagos sincronizados: no existe brecha de financiamiento operativo.';
    }

    return `<div class="dash-cce-card ${stateClass}">
      <div class="dash-cce-head">
        <div>
          <span class="dash-cce-kpi-label">Ciclo de Conversión de Efectivo</span>
          <div class="dash-cce-val-row">
            <strong class="dash-cce-val ${cce<0?'dash-negative':''}">${cce<0?'−':''}${number(Math.abs(cce))}</strong>
            <span class="dash-cce-unit">días</span>
          </div>
        </div>
        <span class="dash-cce-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="dash-cce-chips">
        <div class="dash-cce-chip inv" title="Días de inventario">
          <span>Inventario</span>
          <strong>${number(invDays)} d</strong>
        </div>
        <div class="dash-cce-chip col" title="Período promedio de cobro">
          <span>Cobro</span>
          <strong>${number(colDays)} d</strong>
        </div>
        <div class="dash-cce-chip pay" title="Período promedio de pago">
          <span>Pago</span>
          <strong>${number(payDays)} d</strong>
        </div>
      </div>

      <div class="dash-cce-mini-timeline" aria-label="Línea de tiempo de CCE: Ciclo operativo ${number(operatingCycle)} días, Crédito proveedores ${number(payDays)} días">
        <div class="dash-cce-track-row">
          <span class="dash-cce-track-lbl">Ciclo operativo</span>
          <div class="dash-cce-rail"><div class="dash-cce-fill dash-fill-oc" style="width:${ocPct}%"></div></div>
          <span class="dash-cce-track-val">${number(operatingCycle)} d</span>
        </div>
        <div class="dash-cce-track-row">
          <span class="dash-cce-track-lbl">Crédito prov.</span>
          <div class="dash-cce-rail"><div class="dash-cce-fill dash-fill-pay" style="width:${payPct}%"></div></div>
          <span class="dash-cce-track-val">${number(payDays)} d</span>
        </div>
        <div class="dash-cce-track-row dash-gap-row">
          <span class="dash-cce-track-lbl">${cce>=0?'Brecha neta':'Excedente'}</span>
          <div class="dash-cce-rail"><div class="dash-cce-fill dash-fill-gap" style="left:${gapStart}%;width:${gapWidth}%"></div></div>
          <span class="dash-cce-track-val ${cce<0?'dash-negative':''}">${cce<0?'−':''}${number(Math.abs(cce))} d</span>
        </div>
      </div>

      <p class="dash-cce-interpretation">${esc(interpText)}</p>
      <a class="dash-cce-action" href="../analisis-financiero/index.html?tab=ratios#cce">Ver línea de tiempo detallada <i data-icon="arrow-right"></i></a>
    </div>`;
  }
  function projectionChart(projected){
    const source=projectionMetric==='sales'?data.sales:data.profit,forecast=projected[projectionMetric];
    const points=[source.previous,source.current,forecast];
    if(!points.some(finite))return noData('Completa el estado de resultados para construir el escenario.');
    const hi=Math.max(0,...points.filter(finite)),lo=Math.min(0,...points.filter(finite)),span=hi-lo||1,max=hi+span*.22,min=lo-span*.15,y=v=>28+(max-v)/(max-min)*165,x=[75,355,635];
    const historic=finite(points[0])&&finite(points[1]),planned=finite(points[1])&&finite(points[2]);
    return `<svg viewBox="0 0 720 248" class="dash-projection-svg" role="img" aria-labelledby="projection-chart-title"><title id="projection-chart-title">${projectionMetric==='sales'?'Ventas':'Utilidad neta'}: ${esc(money(source.previous))} en ${esc(c.periods.previous)}, ${esc(money(source.current))} en ${esc(c.periods.current)}; proyección ${esc(money(forecast))} para ${esc(projected.label)}.</title><defs><linearGradient id="projection-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--dash-teal)" stop-opacity=".25"/><stop offset="100%" stop-color="var(--dash-teal)" stop-opacity="0"/></linearGradient></defs>${[0,1,2,3].map(i=>`<line class="dash-grid-line" x1="50" x2="675" y1="${45+i*49}" y2="${45+i*49}"/>`).join('')}<line class="dash-zero" x1="50" x2="675" y1="${y(0)}" y2="${y(0)}"/>${historic?`<path d="M${x[0]} ${y(0)} L${x[0]} ${y(points[0])} L${x[1]} ${y(points[1])} L${x[1]} ${y(0)} Z" fill="url(#projection-fill)"/><path class="dash-historic-line" d="M${x[0]} ${y(points[0])} L${x[1]} ${y(points[1])}"/>`:''}${planned?`<path class="dash-forecast-line" d="M${x[1]} ${y(points[1])} L${x[2]} ${y(points[2])}"/>`:''}${points.map((value,i)=>finite(value)?`<circle class="${i===2?'dash-forecast-point':'dash-historic-point'}" cx="${x[i]}" cy="${y(value)}" r="6"/><text class="dash-line-value" x="${x[i]}" y="${y(value)-17}" text-anchor="middle">${short(value)}</text>`:'').join('')}${[c.periods.previous,c.periods.current,projected.label].map((label,i)=>`<text class="dash-axis" x="${x[i]}" y="224" text-anchor="middle">${esc(label)}${i===2?' · Proyección':''}</text>`).join('')}</svg>`;
  }
  function scenarioHTML(){
    const s=D.settingsFor(c),p=data.projection;
    return `<div class="dash-scenario-metrics"><div><span>Ventas proyectadas · ${esc(p.label)}</span><strong id="projection-sales">${esc(money(p.sales))}</strong></div><div><span>Utilidad neta proyectada</span><strong id="projection-profit">${esc(money(p.profit))}</strong></div><div><span>Margen neto supuesto</span><strong id="projection-margin">${esc(pct(p.margin))}</strong></div></div><div class="dash-projection-legend"><span><b class="dash-line-key"></b>Observado</span><span><b class="dash-line-key forecast"></b>Escenario por supuestos</span></div><div id="projection-chart">${projectionChart(p)}</div><form class="dash-scenario-form" id="dashboard-scenario" novalidate><div class="dash-growth-control"><label for="projection-growth">Crecimiento de ventas <span class="dash-assumption">Supuesto</span></label><div class="dash-growth-inputs"><input id="projection-growth-range" type="range" min="-100" max="200" step="0.1" value="${s.growth??8}" aria-label="Ajustar crecimiento de ventas"><span class="dash-percent-input"><input class="input" id="projection-growth" type="number" min="-100" max="200" step="0.1" value="${s.growth??8}" required aria-label="Crecimiento de ventas en porcentaje"><span>%</span></span></div></div><label class="dash-margin-control" for="projection-margin-input">Margen neto esperado <span class="dash-percent-input"><input class="input" type="number" id="projection-margin-input" step="0.1" min="-100" max="100" value="${finite(s.marginPercent)?s.marginPercent:''}" placeholder="Actual: ${finite(data.margin.current)?number(data.margin.current*100):'sin dato'}" aria-describedby="projection-assumptions"><span>%</span></span></label><div class="dash-scenario-actions"><span id="projection-save-state" role="status">${c.params?.dashboard?.periodKey===D.periodKey(c)?'Escenario guardado':'Supuesto inicial · Editable'}</span><button class="button button-primary" type="submit">Guardar escenario</button></div><p id="projection-error" class="dash-scenario-error" role="alert"></p></form><p class="dash-scenario-note" id="projection-assumptions">Ventas proyectadas = ventas actuales × (1 + crecimiento / 100). Utilidad proyectada = ventas proyectadas × margen neto. Deja el margen vacío para conservar el actual. Es una meta orientativa del próximo período.</p><p class="dash-scenario-foot" id="projection-availability">${!finite(p.sales)?'Se necesitan ventas positivas del año actual para proyectar.':!finite(p.profit)?'Completa la utilidad actual o informa un margen neto supuesto.':'Las proyecciones están separadas de las cifras observadas.'}</p>`;
  }
  function quickAccess(){
    return `<div class="dash-quick-links">${[['proforma','layers','Estados Proforma','blue'],['planeacion-presupuestos','calendar','Planeación y presupuestos','violet'],['presupuesto-personal','user','Presupuesto personal','green'],['levantamiento-activos','box','Levantamiento de activos','amber']].map(([path,icon,title,tone])=>`<a class="dash-quick-link ${tone}" href="../${path}/index.html"><i data-icon="${icon}"></i><strong>${title}</strong><i data-icon="arrow-up-right"></i></a>`).join('')}</div><p class="dash-quick-note">Cada módulo conserva sus propios datos y períodos.</p>`;
  }
  function priorities(){
    const items=[];
    if(data.checks.pending)items.push({tone:'attention',icon:'info',title:'Revisar la información',text:`Hay ${data.checks.pending} comprobaciones pendientes. Revisa los estados antes de tomar este resumen como definitivo.`,href:'analisis-financiero'});
    if(finite(data.profit.current))items.push({tone:data.profit.current<0?'negative':'positive',icon:'trend',title:data.profit.current>0?'El período genera utilidad':data.profit.current<0?'El período registra una pérdida':'Resultado en equilibrio',text:`Resultado neto de ${money(data.profit.current)}, con margen de ${pct(data.margin.current)} sobre las ventas.`,href:'analisis-financiero'});
    else items.push({tone:'attention',icon:'file',title:'Falta completar los resultados',text:'Carga ventas, costos y gastos para evaluar la utilidad y proyectar el siguiente período.',href:'estados-financieros'});
    if(finite(data.currentRatio.current))items.push({tone:data.currentRatio.current<1?'attention':'positive',icon:'scale',title:data.currentRatio.current<1?'Revisar la cobertura de corto plazo':'Cobertura de corto plazo',text:`${number(data.currentRatio.current)} de activo corriente por cada 1 de pasivo corriente. Capital de trabajo: ${money(data.indicators.workingCapital.values.current)}.`,href:'analisis-financiero'});
    const cf=data.cashFlow;
    items.push({tone:cf.status==='reconciled'?'positive':'attention',icon:'wallet',title:cf.status==='reconciled'?'Flujo conciliado':'Revisar el flujo de efectivo',text:cf.status==='reconciled'?`Flujo neto calculado: ${money(cf.net)}. Los supuestos del período están revisados.`:cf.status==='difference'?`Diferencia por explicar: ${money(cf.difference)}.`:cf.status==='estimated'?'El saldo cuadra; falta confirmar las estimaciones y operaciones sin efectivo.':'Completa los datos o la clasificación para explicar el movimiento del efectivo.',href:'flujo-efectivo'});
    return `<div class="dash-priorities">${items.slice(0,4).map(item=>`<a class="dash-priority ${item.tone}" href="../${item.href}/index.html"><span class="dash-priority-icon"><i data-icon="${item.icon}"></i></span><div><h3>${item.title}</h3><p>${esc(item.text)}</p></div><i data-icon="chevron-right"></i></a>`).join('')}</div>`;
  }
  function render(){
    c=C.store.active();basis=D.signature(c);
    if(!C.store.started()&&!c.sample){
      content.innerHTML=`<section class="panel dash-first-run"><span class="dash-first-icon"><i data-icon="chart"></i></span><p class="eyebrow">TU PANORAMA FINANCIERO</p><h2>Empieza con tus estados.<br>Ve lo que cuentan tus números.</h2><p>Carga un balance y un estado de resultados para ver la utilidad, la liquidez, los gráficos y tus metas del próximo período.</p><a class="button button-primary" id="dashboard-start" href="../estados-financieros/index.html?nueva=1"><i data-icon="plus"></i>Cargar mis estados</a><div class="dash-example-actions"><span>O explora un caso de clase</span><button class="button button-secondary" data-dashboard-sample="dayton" type="button">Dayton Products</button><button class="button button-secondary" data-dashboard-sample="mundo-moda" type="button">Mundo Moda</button></div></section>`;window.Finora.hydrateIcons(content);return;
    }
    data=D.analyze(c);
    if(data.income.empty && (data.balance.hasPrevious || data.balance.hasCurrent)){
      const available=[['Efectivo disponible',data.cash.current,'cash','wallet'],['Liquidez corriente',data.currentRatio.current,'liquidity','scale']].filter(([,value])=>finite(value));
      content.innerHTML=`<section class="panel dash-first-run"><span class="dash-first-icon"><i data-icon="file"></i></span><h2>Te falta el estado de resultados</h2><p>Completa ventas, costos y gastos para consultar la utilidad y las proyecciones.</p><a class="button button-primary" href="../estados-financieros/index.html">Completar estados</a></section><section class="dash-kpis" aria-label="Indicadores disponibles">${available.map(([label,value,key,icon])=>`<article class="stat-card dash-kpi"><div class="stat-topline"><span class="stat-label">${label}</span><span class="mini-icon"><i data-icon="${icon}"></i></span></div><p class="stat-value" id="dashboard-${key}">${esc(key==='liquidity'?number(value)+' ×':money(value))}</p></article>`).join('')}</section><div class="dash-grid dash-bottom-grid">${panel('Cómo se financia la empresa',`Composición del financiamiento · ${esc(c.periods.current)}`,funding(),'<i data-icon="bank"></i>','dash-funding')}${panel('Acceso rápido','Continúa tu análisis',quickAccess(),'<i data-icon="spark"></i>','dash-quick')}</div>`;
      window.Finora.hydrateIcons(content);return;
    }
    const labels={positive:'Resultado positivo',negative:'Resultado negativo',neutral:'Resultado en equilibrio',incomplete:'Resultado por completar',review:'Información por revisar'};
    const descriptions={positive:'La empresa registra utilidad neta en el período actual.',negative:'Los resultados del período muestran una pérdida neta.',neutral:'La utilidad neta del período es cero.',incomplete:'Completa los resultados para evaluar la rentabilidad.',review:'Hay datos o comprobaciones pendientes en los estados.'};
    const cards=[['Ventas netas',data.sales.current,'sales','chart'],['Utilidad neta',data.profit.current,'profit','trend'],['Efectivo disponible',data.cash.current,'cash','wallet'],['Liquidez corriente',data.currentRatio.current,'liquidity','scale']];
    content.innerHTML=`<div class="dash-context-line"><span>${esc(c.name)} · ${esc(c.periods.previous)} → ${esc(c.periods.current)}</span><span>Cifras en ${esc(C.fmt.unit(c))}${c.sample?' · Caso de ejemplo':''}</span></div><div class="dash-health ${data.state}" id="dashboard-health" data-state="${data.state}" role="status"><span class="dash-health-dot" aria-hidden="true"></span><strong>${labels[data.state]}</strong><span>${descriptions[data.state]}</span><a href="../analisis-financiero/index.html">Ver análisis <i data-icon="arrow-right"></i></a></div><section class="dash-kpis" aria-label="Indicadores principales">${cards.map(([label,value,key,icon])=>`<article class="stat-card dash-kpi"><div class="stat-topline"><span class="stat-label">${label}</span><span class="mini-icon"><i data-icon="${icon}"></i></span></div><p class="stat-value ${finite(value)&&value<0?'dash-negative':''}" id="dashboard-${key}">${esc(key==='liquidity'?finite(value)?number(value)+' ×':'—':money(value))}</p><div class="dash-kpi-change">${key==='liquidity'?`<span>${finite(data.currentRatio.previous)?number(data.currentRatio.previous)+' × en '+esc(c.periods.previous):'Sin base comparable'}</span>`:variation(key)}</div><p class="dash-kpi-foot">${key==='profit'?'Margen neto: '+esc(pct(data.margin.current)):key==='liquidity'?'Activo corriente / pasivo corriente':key==='cash'?'Saldo informado en el balance':'Cierre del período '+esc(c.periods.current)}</p></article>`).join('')}</section><div class="dash-grid dash-top-grid">${panel('Evolución financiera',`Comparación observada · ${esc(c.periods.previous)} y ${esc(c.periods.current)}`,`<div class="dash-comparison-meta"><div class="dash-legend"><span><b class="dash-dot dash-prior"></b>${esc(c.periods.previous)}</span><span><b class="dash-dot dash-teal"></b>${esc(c.periods.current)}</span></div><span>${esc(C.fmt.unit(c))}</span></div><div id="dashboard-comparison">${comparison()}</div>`,`<div class="dash-tabs" role="group" aria-label="Cambiar gráfico comparativo">${[['income','Resultados'],['balance','Estructura'],['cash','Efectivo']].map(([key,label])=>`<button type="button" data-chart-kind="${key}" aria-pressed="${chartKind===key}">${label}</button>`).join('')}</div>`,'dash-performance')}${panel('Acceso rápido','Continúa tu análisis',quickAccess(),'<i data-icon="spark"></i>','dash-quick')}</div><div class="dash-grid dash-bottom-grid">${panel('El siguiente paso, en cifras',`Escenario para ${esc(data.projection.label)} · Supuestos editables`,scenarioHTML(),`<div class="dash-tabs no-print" role="group" aria-label="Serie de proyección"><button type="button" data-projection-metric="sales" aria-pressed="${projectionMetric==='sales'}">Ventas</button><button type="button" data-projection-metric="profit" aria-pressed="${projectionMetric==='profit'}">Utilidad</button></div>`,'dash-scenario')}<div class="dash-side-stack">${panel('Conversión de efectivo',`Ciclo operativo vs. crédito proveedores · ${esc(c.periods.current)}`,cceCardHTML(),'<i data-icon="repeat"></i>','dash-cce')}${panel('Cómo se financia la empresa',`Composición del financiamiento · ${esc(c.periods.current)}`,funding(),'<i data-icon="bank"></i>','dash-funding')}</div></div>${panel('Lectura del período','Prioridades basadas en tus cifras',priorities(),'<i data-icon="spark"></i>','dash-reading')}<section class="dash-detail-links no-print" aria-label="Explorar el detalle">${[['estados-financieros','grid','Estados financieros','El origen de tus cifras'],['analisis-financiero','chart','Análisis financiero','Razones y comparaciones'],['flujo-efectivo','wallet','Flujo de efectivo','Explicar el cambio de caja'],['punto-equilibrio','trend','Punto de equilibrio','Costos y margen de seguridad']].map(([path,icon,title,note])=>`<a href="../${path}/index.html"><span class="mini-icon"><i data-icon="${icon}"></i></span><div><strong>${title}</strong><span>${note}</span></div><i data-icon="arrow-up-right"></i></a>`).join('')}</section>`;
    window.Finora.hydrateIcons(content);
  }
  function readScenario(){
    const growthText=document.getElementById('projection-growth').value,marginText=document.getElementById('projection-margin-input').value;
    return {growth:growthText.trim()===''?NaN:Number(growthText),marginPercent:marginText.trim()===''?null:Number(marginText)};
  }
  function preview(dirty=true){
    const error=document.getElementById('projection-error');if(!error)return;
    try{
      const p=D.project(c,readScenario(),data.income);error.textContent='';document.querySelector('#dashboard-scenario button[type="submit"]').disabled=false;
      document.getElementById('projection-sales').textContent=money(p.sales);document.getElementById('projection-profit').textContent=money(p.profit);document.getElementById('projection-margin').textContent=pct(p.margin);document.getElementById('projection-chart').innerHTML=projectionChart(p);
      document.getElementById('projection-availability').textContent=!finite(p.sales)?'Se necesitan ventas positivas del año actual para proyectar.':!finite(p.profit)?'Completa la utilidad actual o informa un margen neto supuesto.':'Las proyecciones están separadas de las cifras observadas.';
      if(dirty)document.getElementById('projection-save-state').textContent='Vista previa · Sin guardar';
    }catch(e){error.textContent=e.message;for(const id of ['projection-sales','projection-profit','projection-margin'])document.getElementById(id).textContent='—';document.getElementById('projection-chart').innerHTML='<div class="dash-no-data"><p>Corrige los supuestos para ver la proyección.</p></div>';document.getElementById('projection-availability').textContent='No hay una proyección válida con estos supuestos.';document.querySelector('#dashboard-scenario button[type="submit"]').disabled=true;document.getElementById('projection-save-state').textContent='Revisa los supuestos';}
  }
  content.addEventListener('input',event=>{
    if(event.target.id==='projection-growth-range')document.getElementById('projection-growth').value=event.target.value;
    if(event.target.id==='projection-growth'&&finite(Number(event.target.value)))document.getElementById('projection-growth-range').value=event.target.value;
    if(event.target.closest('#dashboard-scenario'))preview();
  });
  content.addEventListener('click',event=>{
    const sample=event.target.closest('[data-dashboard-sample]');if(sample){C.store.setActive(sample.dataset.dashboardSample);return;}
    const chart=event.target.closest('[data-chart-kind]');if(chart){chartKind=chart.dataset.chartKind;content.querySelectorAll('[data-chart-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b===chart)));document.getElementById('dashboard-comparison').innerHTML=comparison();window.Finora.hydrateIcons(content);}
    const metric=event.target.closest('[data-projection-metric]');if(metric){projectionMetric=metric.dataset.projectionMetric;content.querySelectorAll('[data-projection-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b===metric)));preview(false);}
  });
  const tooltip=event=>{const bar=event.target.closest('[data-chart-label]'),tip=document.getElementById('dashboard-tooltip');if(!tip)return;tip.hidden=!bar;if(bar)tip.textContent=bar.dataset.chartLabel;};
  content.addEventListener('pointerover',tooltip);content.addEventListener('focusin',tooltip);
  content.addEventListener('focusout',()=>{const tip=document.getElementById('dashboard-tooltip');if(tip)tip.hidden=true;});
  content.addEventListener('pointerleave',()=>{const tip=document.getElementById('dashboard-tooltip');if(tip)tip.hidden=true;});
  content.addEventListener('submit',event=>{
    if(event.target.id!=='dashboard-scenario')return;event.preventDefault();const current=C.store.active();
    if(D.signature(current)!==basis){render();window.Finora.toast('Los estados cambiaron. Revisa el escenario con las cifras actualizadas.');return;}
    try{const settings=readScenario();D.project(current,settings);current.params={...current.params,dashboard:{...settings,periodKey:D.periodKey(current)}};const saved=C.store.save(current);window.Finora.toast(saved?'Escenario guardado para esta empresa y estos años.':'Escenario actualizado. No se pudo conservar el guardado al cerrar el navegador.');}catch(e){document.getElementById('projection-error').textContent=e.message;}
  });
  document.getElementById('dashboard-print').addEventListener('click',()=>window.print());
  window.FinoraCaseBar.mount(document.getElementById('case-bar'));C.store.subscribe(render);render();
})();
