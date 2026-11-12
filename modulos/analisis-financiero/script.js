/* Análisis financiero conectado al caso activo. Las cifras salen de casos.js y del motor; aquí solo se presentan. */
(() => {
  'use strict';
  const C = window.FinoraCasos, { fmt, SIDES } = C;
  const { hydrateIcons } = window.Finora;
  const esc = window.FinoraCaseBar.esc;
  const F = C.engine;
  const $ = id => document.getElementById(id);

  const num = v => `<span class="${v < 0 ? 'num-negative' : ''}">${fmt.number(v)}</span>`;
  const pctCell = (v, reason) => v === null || v === undefined ? `<span class="muted" title="${esc(reason || '')}">N/A</span>` : `<span class="${v < 0 ? 'num-negative' : ''}">${v < 0 ? `(${fmt.pct(Math.abs(v))})` : fmt.pct(v)}</span>`;
  const panel = (title, subtitle, body, badge = '') => `<article class="panel"><div class="panel-header"><div><h2 class="panel-title">${title}</h2>${subtitle ? `<p class="panel-subtitle">${subtitle}</p>` : ''}</div>${badge}</div>${body}</article>`;
  const empty = (title, text, link = true) => `<div class="empty-panel"><h3>${title}</h3><p>${text}</p>${link ? '<a class="button button-secondary" href="../estados-financieros/index.html?estado=resultados"><i data-icon="file"></i>Capturar en Estados financieros</a>' : ''}</div>`;

  // ---------- Tabla vertical y horizontal ----------
  const ROW_CLASS = { section: 'row-section', group: 'row-group', account: 'row-account', net: 'row-net', subtotal: 'row-subtotal', total: 'row-total', result: 'row-result' };
  function accountTable(c, rows, verticalLabel) {
    const p = c.periods;
    const head = `<thead><tr><th scope="col">Cuenta</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th><th scope="col">Vertical ${esc(p.previous)}</th><th scope="col">Vertical ${esc(p.current)}</th><th scope="col">Variación absoluta</th><th scope="col">Variación %</th></tr></thead>`;
    const body = rows.map(r => {
      const cls = r.final ? 'row-final' : `${ROW_CLASS[r.type] || ''}${r.type === 'account' && r.sign === -1 ? ' row-contra' : ''}`;
      if (r.type === 'section' || r.type === 'group') return `<tr class="${cls}"><td colspan="7">${esc(r.label)}</td></tr>`;
      const label = r.computed ? `${esc(r.label)} <span class="muted">· calculado</span>` : esc(r.label);
      return `<tr class="${cls}"><td>${label}</td><td>${num(r.before)}</td><td>${num(r.after)}</td><td class="vertical">${pctCell(r.verticalBefore, 'Sin base')}</td><td class="vertical">${pctCell(r.verticalAfter, 'Sin base')}</td><td>${num(r.absolute)}</td><td>${pctCell(r.relative, r.relativeReason)}</td></tr>`;
    }).join('');
    return `<div class="table-scroll"><table class="account-table analysis-table">${head}<tbody>${body}</tbody></table></div>`;
  }

  function renderBalance(c, b) {
    if (!b.rows.length) { $('panel-balance').innerHTML = panel('Balance general', '', empty('Sin cuentas', 'Captura el balance general en Estados financieros.')); return; }
    const errors = SIDES.filter(side => b.errors[side]).map(side => `<p class="note warning-note"><strong>${esc(c.periods[side])}:</strong> ${esc(b.errors[side])}</p>`).join('');
    $('panel-balance').innerHTML = panel(`${esc(c.name)} — análisis vertical y horizontal`, `Balance general ${esc(c.statementDate || '')} de ${esc(c.periods.previous)} y ${esc(c.periods.current)} · Cifras en ${esc(fmt.unit(c) || 'unidades')}`,
      `${errors}${accountTable(c, b.rows)}<p class="table-footnote">El análisis vertical usa el <strong>total de activos</strong> como base para el activo y el <strong>total de pasivo y capital</strong> como base para el financiamiento. La variación horizontal usa ${esc(c.periods.previous)} como período base. Cuando la base es cero se muestra N/A. Las cantidades entre paréntesis son negativas.</p>`,
      `<span class="badge ${b.balanced.previous && b.balanced.current ? 'badge-green' : 'badge-amber'}">${b.balanced.previous && b.balanced.current ? 'El balance cuadra' : 'Revisa el cuadre'}</span>`);
  }

  function renderIncome(c, i) {
    if (i.empty) { $('panel-income').innerHTML = panel('Estado de resultados', '', empty('Esta empresa no tiene estado de resultados', `${esc(c.name)} solo trae el balance general. Captura sus ingresos, costos y gastos para ver su análisis vertical y horizontal, los márgenes y las razones de rentabilidad.`)); return; }
    const missing = i.missing.length ? `<p class="note warning-note">Falta informar: ${esc(i.missing.join(', '))}. Los subtotales que dependen de esas cuentas quedan en blanco.</p>` : '';
    const errors = SIDES.filter(side => i.errors[side]).map(side => `<p class="note warning-note"><strong>${esc(c.periods[side])}:</strong> ${esc(i.errors[side])}</p>`).join('');
    $('panel-income').innerHTML = panel(`${esc(c.name)} — estado de resultados vertical y horizontal`, `Períodos ${esc(c.periods.previous)} y ${esc(c.periods.current)} · Cifras en ${esc(fmt.unit(c) || 'unidades')}`,
      `${errors}${missing}${accountTable(c, i.rows)}<p class="table-footnote">El análisis vertical usa las <strong>ventas netas</strong> de cada período como base (100 %). La variación horizontal usa ${esc(c.periods.previous)} como período base.</p>`);
  }

  // ---------- Gráficas ----------
  const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
  function donut(parts, title) {
    const total = parts.reduce((t, x) => t + Math.max(0, x.value || 0), 0);
    const r = 70, cx = 90, cy = 90, stroke = 30, circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = total > 0 ? parts.map((x, k) => {
      const len = Math.max(0, x.value || 0) / total * circ;
      const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${PALETTE[k % PALETTE.length]}" stroke-width="${stroke}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(x.label)}: ${fmt.pct(x.share)}</title></circle>`;
      offset += len; return arc;
    }).join('') : '';
    const legend = parts.map((x, k) => `<li><span class="key-dot" style="background:${PALETTE[k % PALETTE.length]}"></span>${esc(x.label)}<strong>${fmt.pct(x.share)}</strong></li>`).join('');
    return `<figure class="donut-figure"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 180 180" role="img" aria-label="${esc(title)}: ${parts.map(x => `${x.label} ${fmt.pct(x.share)}`).join(', ')}">${arcs}<text x="90" y="86" text-anchor="middle" class="donut-center">100%</text><text x="90" y="104" text-anchor="middle" class="donut-sub">del activo</text></svg><ul class="chart-key">${legend}</ul></figure>`;
  }
  function groupedBars(categories, series, title, max = 1) {
    const w = 520, h = 250, left = 44, right = 12, top = 22, bottom = 40;
    const plotW = w - left - right, plotH = h - top - bottom;
    const groupW = plotW / categories.length, barW = Math.min(46, groupW / (series.length + 1));
    const y = v => top + plotH - Math.max(0, Math.min(v ?? 0, max)) / max * plotH;
    const ticks = [0, .25, .5, .75, 1].map(t => t * max);
    let svg = ticks.map(t => `<line class="chart-grid" x1="${left}" x2="${w - right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${left - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`).join('');
    categories.forEach((cat, ci) => {
      const gx = left + ci * groupW + (groupW - barW * series.length) / 2;
      series.forEach((s, si) => {
        const v = s.values[ci], x = gx + si * barW;
        if (v === null || v === undefined) return;
        svg += `<rect class="bar bar-${si}" x="${x + 3}" y="${y(v)}" width="${barW - 6}" height="${top + plotH - y(v)}" rx="3"><title>${esc(cat)} ${esc(s.label)}: ${fmt.pct(v)}</title></rect><text class="bar-label" x="${x + barW / 2}" y="${y(v) - 6}" text-anchor="middle">${fmt.pct(v)}</text>`;
      });
      svg += `<text class="axis-label" x="${left + ci * groupW + groupW / 2}" y="${h - 14}" text-anchor="middle">${esc(cat)}</text>`;
    });
    const legend = series.map((s, si) => `<li><span class="key-dot bar-key-${si}"></span>${esc(s.label)}</li>`).join('');
    return `<figure class="bar-figure"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">${svg}</svg><ul class="chart-key chart-key-inline">${legend}</ul></figure>`;
  }

  function renderCharts(c, b, i) {
    const p = c.periods, ind = C.indicators(c, b, i);
    if (ind.margins) { const academic=window.FinoraAcademicAnalysis.analyze(c,b,i); ind.margins.net=Object.fromEntries(SIDES.map(side=>[side,academic[side]?.profitability?.metrics?.netMargin?.value??null])); }
    if (!(b.hasPrevious && b.hasCurrent)) { $('panel-charts').innerHTML = panel('Gráficas e indicadores', '', empty('Faltan datos', 'Se necesitan los dos períodos del balance.')); return; }
    const wc = ind.workingCapital;
    const ppRow = (label, pair) => `<tr><td>${label}</td><td>${fmt.pct(pair.previous)}</td><td>${fmt.pct(pair.current)}</td><td colspan="2">${pair.previous !== null && pair.current !== null ? `<span class="${pair.current - pair.previous < 0 ? 'num-negative' : ''}">${fmt.pp(pair.current - pair.previous)}</span>` : '—'}</td></tr>`;
    let indicatorsTable = `<div class="table-scroll"><table class="account-table indicator-table"><thead><tr><th scope="col">Indicador</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th><th scope="col">Variación</th><th scope="col">Variación %</th></tr></thead><tbody>
      <tr><td>Capital de trabajo neto <span class="muted">(activo circulante − pasivo de corto plazo)</span></td><td>${num(wc.values.previous)}</td><td>${num(wc.values.current)}</td><td>${num(wc.absolute)}</td><td>${pctCell(wc.relative, wc.relativeReason)}</td></tr>
      <tr class="row-group"><td colspan="5">Estructura financiera <span class="muted">· cambio en puntos porcentuales</span></td></tr>
      ${ppRow('Participación del pasivo', ind.liabilitiesShare)}${ppRow('Participación del capital', ind.equityShare)}`;
    if (ind.margins) indicatorsTable += `<tr class="row-group"><td colspan="5">Márgenes del estado de resultados</td></tr>${ppRow('Margen bruto', ind.margins.gross)}${ppRow('Margen operativo', ind.margins.operating)}${ppRow('Margen neto', ind.margins.net)}`;
    indicatorsTable += '</tbody></table></div>';
    const comp = side => ind.composition.map(g => ({ label: g.name, value: g.values[side], share: g.share[side] }));
    const donuts = `<div class="donut-grid">${donut(comp('previous'), `Composición porcentual de activos ${p.previous}`)}${donut(comp('current'), `Composición porcentual de activos ${p.current}`)}</div>`;
    const funding = groupedBars(['Pasivo', 'Capital'], [{ label: p.previous, values: [ind.liabilitiesShare.previous, ind.equityShare.previous] }, { label: p.current, values: [ind.liabilitiesShare.current, ind.equityShare.current] }], 'Participación porcentual de pasivo y capital');
    let html = panel('Lectura financiera del balance general', `Indicadores de ${esc(p.previous)} y ${esc(p.current)}`, indicatorsTable)
      + `<div class="equal-columns">${panel('Composición porcentual de activos', 'Peso de cada grupo sobre el total de activos', `<div class="panel-body">${donuts}</div>`)}${panel('Participación porcentual: pasivo y capital', 'Cómo se financian los activos', `<div class="panel-body">${funding}</div>`)}</div>`;
    if (ind.margins) {
      const m = ind.margins;
      html += panel('Márgenes de utilidad', 'Utilidad por cada 100 de ventas', `<div class="panel-body">${groupedBars(['Margen bruto', 'Margen operativo', 'Margen neto'], [{ label: p.previous, values: [m.gross.previous, m.operating.previous, m.net.previous] }, { label: p.current, values: [m.gross.current, m.operating.current, m.net.current] }], 'Márgenes de utilidad', niceMax(Math.max(...[m.gross, m.operating, m.net].flatMap(x => [x.previous, x.current]).filter(v => v !== null))))}</div>`);
    }
    $('panel-charts').innerHTML = html;
  }
  const niceMax = v => Math.min(1, Math.max(.25, Math.ceil((v || 0) * 4 + .2) / 4));

  // ---------- Interpretación y recomendaciones ----------
  function renderReading(c, b, i) {
    const items = C.interpret(c, b, i);
    $('panel-reading').innerHTML = panel('Interpretación del análisis vertical y horizontal', 'Redactada automáticamente con las cifras de la empresa; cambia si cambias las cuentas.',
      items.length ? `<ol class="insight-list">${items.map(x => `<li><strong>${esc(x.topic)}</strong><p>${esc(x.text.replace(/margen neto/gi, 'margen sobre utilidad neta'))}</p></li>`).join('')}</ol>` : empty('Faltan datos', 'La interpretación necesita el balance de los dos períodos.'));
  }
  function renderAdvice(c, b, i) {
    const recs = C.recommend(c, b, i);
    const body = recs.length ? `<div class="table-scroll"><table class="account-table advice-table"><thead><tr><th scope="col">Prioridad</th><th scope="col">Área</th><th scope="col">Evidencia financiera</th><th scope="col">Recomendación</th><th scope="col">Acción sugerida</th><th scope="col">Seguimiento</th></tr></thead><tbody>${recs.map(r => `<tr><td><span class="priority priority-${r.priority === 'Alta' ? 'high' : 'medium'}">${esc(r.priority)}</span></td><td><strong>${esc(r.area)}</strong></td><td>${esc(r.evidence)}</td><td>${esc(r.recommendation)}</td><td>${esc(r.action)}</td><td>${esc(r.followUp)}</td></tr>`).join('')}</tbody></table></div>`
      : empty('Sin recomendaciones', b.hasPrevious && b.hasCurrent ? 'Ninguna cuenta supera los umbrales de alerta.' : 'Las recomendaciones necesitan el balance de los dos períodos.', false);
    $('panel-advice').innerHTML = panel('Recomendaciones financieras fundamentadas', 'Generadas por reglas a partir de las variaciones y los pesos de cada cuenta.', `${body}<p class="table-footnote"><strong>Criterio:</strong> no se recomienda invertir ni pagar toda la deuda de manera automática. Las decisiones deben preservar el capital de trabajo, la reserva operativa y la capacidad de pago${i.empty ? ', y contrastarse con el estado de resultados y el flujo de efectivo cuando estén disponibles' : ', y contrastarse con el flujo de efectivo'}.</p>`);
  }

  // ---------- Razones y DuPont ----------
  function metricText(m, c) {
    if (!m || m.error) return `<span class="muted" title="${esc(m?.error || '')}">—</span>`;
    if (m.value === null) return `<span class="muted" title="${esc(m.reason)}">—</span>`;
    if (m.unit === 'money') return num(m.value);
    if (m.unit === 'percent') return fmt.pct(m.value);
    if (m.unit === 'days') return `${fmt.plain(m.value, 1)} días`;
    return `${fmt.plain(m.value)} veces`;
  }
  function renderRatios(c, b, i) {
    const r = window.FinoraAcademicAnalysis.analyze(c, b, i), p = c.periods;
    const get = (side, path) => path.split('.').reduce((o, k) => o?.[k], r[side]);
    const groups = [
      ['Liquidez', [['Capital de trabajo neto', 'liquidity.workingCapital'], ['Razón circulante', 'liquidity.currentRatio'], ['Prueba ácida', 'liquidity.quickRatio']]],
      ['Endeudamiento', [['Razón de deuda', 'debt.debtRatio'], ['Deuda a capital', 'debt.debtEquity'], ['Cobertura de intereses', 'debt.interestCoverage']]],
      ['Actividad', [['Rotación de inventario', 'activity.metrics.inventoryTurnover'], ['Días de inventario', 'activity.metrics.inventoryDays'], ['Rotación de cuentas por cobrar', 'activity.metrics.receivableTurnover'], ['Período promedio de cobro', 'activity.metrics.collectionDays'], ['Rotación de cuentas por pagar', 'activity.metrics.payableTurnover'], ['Período promedio de pago', 'activity.metrics.paymentDays'], ['Rotación de activos fijos', 'activity.metrics.fixedTurnover'], ['Rotación de activos totales', 'activity.metrics.assetTurnover']]],
      ['Rentabilidad', [['Margen bruto', 'profitability.metrics.grossMargin'], ['Margen operativo', 'profitability.metrics.operatingMargin'], ['Margen neto', 'profitability.metrics.netMargin'], ['Rendimiento del activo (ROA)', 'profitability.metrics.roa'], ['Rendimiento del capital (ROE)', 'profitability.metrics.roe']]]
    ];
    const needsIncome = path => /^(activity|profitability)/.test(path) || path === 'debt.interestCoverage';
    const rows = groups.map(([title, list]) => {
      if (i.empty && title !== 'Liquidez' && title !== 'Endeudamiento') return `<tr class="row-group"><td colspan="4">${title}</td></tr><tr><td colspan="4" class="muted">Necesita el estado de resultados.</td></tr>`;
      return `<tr class="row-group"><td colspan="4">${title}</td></tr>` + list.filter(([, path]) => !(i.empty && needsIncome(path))).map(([label, path]) => {
        const m = get('current', path) || get('previous', path);
        // Aquí se usan saldos al cierre: el texto del motor dice «promedio» cuando hay período anterior.
        const formula = String(m?.formula || '');
        return `<tr><td>${label}</td><td class="formula">${esc(formula)}</td><td>${metricText(get('previous', path), c)}</td><td>${metricText(get('current', path), c)}</td></tr>`;
      }).join('');
    }).join('');
    const table = `<div class="table-scroll"><table class="account-table ratio-table"><thead><tr><th scope="col">Razón</th><th scope="col">Fórmula</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="table-footnote">La actividad del período actual usa el promedio de los dos balances y 365 días. El período anterior requiere un balance inicial adicional. Las compras estimadas y las ventas a crédito se informan abajo. Pasa el cursor sobre «—» para ver qué dato falta.</p>`;
    let dupont = empty('DuPont necesita el estado de resultados', 'Con ventas y utilidad neta se descompone el ROE en margen, rotación y multiplicador de capital.');
    const d = r.current?.profitability?.dupont;
    const roaMetric = r.current?.profitability?.metrics?.roa;
    if (d && d.roe?.value !== null && d.roe?.value !== undefined) {
      const roaValue = Number.isFinite(roaMetric?.value) ? roaMetric.value : (d.margin.value * d.turnover.value);
      const roaAmt = Math.abs(roaValue * 100);
      const curr = esc(c.currency || '');
      const roaExplanation = roaValue < 0
        ? `Cada ${curr} 100 invertidos en activos registraron una pérdida neta de ${curr} ${fmt.plain(roaAmt)} durante ${esc(p.current)}.`
        : roaValue === 0
        ? `Cada ${curr} 100 invertidos en activos generaron ${curr} 0.00 de utilidad neta durante ${esc(p.current)} (resultado en equilibrio).`
        : `Cada ${curr} 100 invertidos en activos generaron ${curr} ${fmt.plain(roaAmt)} de utilidad neta durante ${esc(p.current)}.`;

      dupont = `<div class="panel-body">
        <div class="dupont-grid">
          <!-- Etapa 1: Margen × Rotación = ROA -->
          <div class="dupont-stage">
            <span class="dupont-stage-badge">Etapa 1 · Rendimiento operativo sobre activos</span>
            <div class="dupont-row">
              <div class="dupont-factor">
                <span>Margen sobre utilidad neta</span>
                <strong class="${d.margin.value < 0 ? 'num-negative' : ''}">${fmt.pct(d.margin.value)}</strong>
                <small>Utilidad neta / ventas</small>
              </div>
              <span class="math-symbol">×</span>
              <div class="dupont-factor">
                <span>Rotación de activos</span>
                <strong>${fmt.plain(d.turnover.value, 3)}</strong>
                <small>Ventas / activos</small>
              </div>
              <span class="math-symbol">=</span>
              <div class="dupont-factor dupont-intermediate">
                <span class="dupont-tag">Rendimiento de activos</span>
                <strong class="${roaValue < 0 ? 'num-negative' : ''}">ROA ${fmt.pct(roaValue)}</strong>
                <small>Margen × Rotación</small>
              </div>
            </div>
            <p class="dupont-subtext">${esc(roaExplanation)}</p>
          </div>

          <div class="dupont-connector" aria-hidden="true">
            <span class="dupont-connector-line"></span>
            <span class="dupont-connector-arrow">↓</span>
          </div>

          <!-- Etapa 2: ROA × Multiplicador = ROE -->
          <div class="dupont-stage">
            <span class="dupont-stage-badge">Etapa 2 · Apalancamiento y rendimiento para el accionista</span>
            <div class="dupont-row">
              <div class="dupont-factor dupont-intermediate">
                <span class="dupont-tag">Base operativa</span>
                <strong class="${roaValue < 0 ? 'num-negative' : ''}">ROA ${fmt.pct(roaValue)}</strong>
                <small>Utilidad neta / activos</small>
              </div>
              <span class="math-symbol">×</span>
              <div class="dupont-factor">
                <span>Multiplicador de capital</span>
                <strong>${fmt.plain(d.leverage.value, 3)}</strong>
                <small>Activos / capital</small>
              </div>
              <span class="math-symbol">=</span>
              <div class="dupont-result">
                <span>ROE ${esc(p.current)}</span>
                <strong class="${d.roe.value < 0 ? 'num-negative' : ''}">${fmt.pct(d.roe.value)}</strong>
                <small>Rendimiento del capital</small>
              </div>
            </div>
            <p class="dupont-subtext">Cada ${curr} 100 de capital generó ${curr} ${fmt.plain(d.roe.value * 100)} de utilidad neta en ${esc(p.current)}. Se usan los saldos de activos y capital al cierre.</p>
          </div>
        </div>
      </div>`;
    }
    $('panel-ratios').innerHTML = panel('Razones financieras', `${esc(p.previous)} y ${esc(p.current)}`, table) + renderCCE(c,r) + renderRetained(c,i) + panel('Modelo DuPont', `Los tres motores del ROE · ${esc(p.current)}`, dupont);
  }

  function renderRetained(c,i){
    const r=window.FinoraAcademicAnalysis.retained(c,i),fmtMoney=value=>Number.isFinite(value)?fmt.money(value,c):'Pendiente';
    if([r.prior,r.current,r.reported,r.paid].every(value=>value===null))return '';
    const agrees=Number.isFinite(r.change)&&Number.isFinite(r.fromIncome)?Math.abs(r.change-r.fromIncome)<.01:null;
    return panel('Cambios en utilidades retenidas','Comprobación entre balances y resultados',`<div class="panel-body"><p>Saldo inicial: ${esc(fmtMoney(r.prior))} · Saldo final: ${esc(fmtMoney(r.current))} · Cambio entre balances: <strong>${esc(fmtMoney(r.change))}</strong></p><p>Dividendos totales informados: ${esc(fmtMoney(r.paid))} · Utilidad neta menos dividendos: ${esc(fmtMoney(r.fromIncome))} · Incremento reportado: ${esc(fmtMoney(r.reported))}</p><p>${agrees===null?'Faltan datos para comprobar el cambio; no se asume que los dividendos no especificados sean preferentes.':agrees?'El cambio coincide con la utilidad neta menos los dividendos informados.':'El cambio no coincide; revisa aportes, ajustes u otros movimientos patrimoniales.'}</p></div>`);
  }
  function renderCCE(c,r) {
    const cfg=c.params?.academicAnalysis?.current||{}, a=r.current?.activity, m=a?.metrics||{};
    const invDays=m.inventoryDays?.value, colDays=m.collectionDays?.value, payDays=m.paymentDays?.value, cce=a?.cce;
    const valid=Number.isFinite(cce)&&Number.isFinite(invDays)&&Number.isFinite(colDays)&&Number.isFinite(payDays);

    // KPI Cards Grid
    const kpiCard=(label,val,sub,colorCls)=>`<div class="cce-kpi-card ${colorCls}">
      <span class="cce-kpi-lbl">${label}</span>
      <strong class="cce-kpi-num">${Number.isFinite(val)?(val<0?'−':'')+fmt.plain(Math.abs(val),1):'—'}</strong>
      <small class="cce-kpi-sub">${sub}</small>
    </div>`;

    const oc = valid ? (invDays + colDays) : null;
    const kpis = `<div class="cce-kpi-grid">
      ${kpiCard('Días de inventario', invDays, 'Tiempo en almacén', 'cce-kpi-inv')}
      ${kpiCard('Días de cobro', colDays, 'Crédito a clientes', 'cce-kpi-col')}
      ${kpiCard('Ciclo operativo', oc, 'Inventario + cobro', 'cce-kpi-oc')}
      ${kpiCard('Días de pago', payDays, 'Crédito proveedores', 'cce-kpi-pay')}
      ${kpiCard('Ciclo de conversión', cce, valid?(cce>0?'Financiamiento requerido':cce<0?'Autofinanciamiento':'Equilibrio exacto'):'Pendiente', valid?(cce>0?'cce-kpi-gap':cce<0?'cce-kpi-surplus':'cce-kpi-bal'):'')}
    </div>`;

    // SVG Timeline Diagram
    let timelineGraphic = '';
    if (valid) {
      const maxDays = Math.max(oc, payDays, 1);
      const svgW = 760, padL = 70, padR = 70, usableW = svgW - padL - padR;
      const xPos = day => padL + (Math.max(0, day) / maxDays) * usableW;

      const x0 = xPos(0);             // Compra (T=0)
      const xInv = xPos(invDays);      // Venta (T=invDays)
      const xPay = xPos(payDays);      // Pago (T=payDays)
      const xCol = xPos(oc);           // Cobro (T=oc)

      // Rango de la brecha CCE
      const xGapStart = Math.min(xPay, xCol);
      const xGapWidth = Math.max(2, Math.abs(xCol - xPay));

      const gapColor = cce > 0 ? 'var(--dash-negative, #b34151)' : cce < 0 ? 'var(--dash-positive, #16735f)' : 'var(--blue, #1672e8)';
      const gapLabel = cce > 0 ? `Brecha CCE: +${fmt.plain(cce, 1)} d (Financiamiento requerido)` : cce < 0 ? `Brecha CCE: −${fmt.plain(Math.abs(cce), 1)} d (Excedente de financiamiento)` : 'Equilibrio CCE: 0 días';

      // Hitos ordenados para markers
      const milestones = [
        { label: '1. Compra', day: 0, x: x0, color: '#176bd4', role: 'Entrada inventario' },
        { label: '2. Venta', day: invDays, x: xInv, color: '#2864f0', role: 'Salida almacén' },
        { label: '3. Pago', day: payDays, x: xPay, color: '#dc7b15', role: 'Salida de caja' },
        { label: '4. Cobro', day: oc, x: xCol, color: '#15975b', role: 'Entrada de caja' }
      ];

      timelineGraphic = `<div class="cce-timeline-wrap">
        <h4 class="cce-section-title">Línea de tiempo del ciclo operativo y financiero</h4>
        <svg class="cce-timeline-svg" viewBox="0 0 760 270" role="img" aria-label="Línea de tiempo interactiva de CCE. Inventario ${fmt.plain(invDays,1)} días, Cobro ${fmt.plain(colDays,1)} días, Pago ${fmt.plain(payDays,1)} días, CCE ${fmt.plain(cce,1)} días.">
          <defs>
            <linearGradient id="cce-oc-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#176bd4"/>
              <stop offset="${(invDays / Math.max(1, oc)) * 100}%" stop-color="#2864f0"/>
              <stop offset="100%" stop-color="#15975b"/>
            </linearGradient>
          </defs>

          <!-- Eje horizontal y grilla de días -->
          <line class="cce-axis-line" x1="${padL}" y1="175" x2="${svgW - padR}" y2="175"/>
          <text class="cce-axis-txt" x="${padL}" y="195" text-anchor="middle">Día 0</text>
          <text class="cce-axis-txt" x="${svgW - padR}" y="195" text-anchor="middle">Día ${Math.round(maxDays)}</text>

          <!-- Barra 1: Ciclo Operativo (Día 0 hasta Día OC) -->
          <g class="cce-bar-group">
            <rect class="cce-band" x="${x0}" y="42" width="${Math.max(2, xCol - x0)}" height="26" rx="6" fill="url(#cce-oc-grad)" opacity="0.9"/>
            <text class="cce-bar-caption" x="${x0 + (xCol - x0) / 2}" y="59" text-anchor="middle" fill="#ffffff">Ciclo Operativo: ${fmt.plain(oc, 1)} días (Inventario + Cobro)</text>
          </g>

          <!-- Barra 2: Crédito de Proveedores (Día 0 hasta Día Pay) -->
          <g class="cce-bar-group">
            <rect class="cce-band" x="${x0}" y="84" width="${Math.max(2, xPay - x0)}" height="24" rx="6" fill="#dc7b15" opacity="0.85"/>
            <text class="cce-bar-caption" x="${x0 + (xPay - x0) / 2}" y="100" text-anchor="middle" fill="#ffffff">Crédito Proveedores: ${fmt.plain(payDays, 1)} días</text>
          </g>

          <!-- Barra 3: Brecha CCE (Entre Pago y Cobro) -->
          <g class="cce-bar-group">
            <rect class="cce-band cce-band-gap" x="${xGapStart}" y="124" width="${xGapWidth}" height="24" rx="6" fill="${gapColor}" opacity="0.9"/>
            <text class="cce-bar-caption" x="${xGapStart + xGapWidth / 2}" y="140" text-anchor="middle" fill="#ffffff">${esc(gapLabel)}</text>
          </g>

          <!-- Marcadores de Hitos Cronológicos -->
          ${milestones.map(m => `
            <g class="cce-milestone">
              <line class="cce-guide-line" x1="${m.x}" y1="32" x2="${m.x}" y2="175" stroke="${m.color}" stroke-dasharray="2 3"/>
              <circle class="cce-node" cx="${m.x}" cy="175" r="6" fill="#ffffff" stroke="${m.color}" stroke-width="3"/>
              <text class="cce-node-label" x="${m.x}" y="215" text-anchor="middle" fill="var(--ink)">${m.label}</text>
              <text class="cce-node-days" x="${m.x}" y="232" text-anchor="middle" fill="var(--muted)">${fmt.plain(m.day, 1)} d · ${m.role}</text>
            </g>
          `).join('')}
        </svg>
      </div>`;
    } else {
      timelineGraphic = `<div class="cce-empty-state">
        <p class="muted">Ingresa las premisas de ventas y compras a crédito abajo para proyectar la línea de tiempo cronológica.</p>
      </div>`;
    }

    // Interpretation Block
    let interpretation = '';
    if (valid) {
      if (cce > 0) {
        interpretation = `<div class="cce-insight-box insight-gap">
          <h4><i data-icon="alert-circle"></i> Brecha de financiamiento operativo: ${fmt.plain(cce, 1)} días</h4>
          <p>La empresa debe pagar a sus proveedores <strong>${fmt.plain(cce, 1)} días antes</strong> de recuperar el efectivo de la venta a través del cobro a clientes. Este período requiere financiamiento bancario, capital de trabajo propio o negociación de mayores plazos de pago para mitigar la presión sobre la liquidez.</p>
        </div>`;
      } else if (cce < 0) {
        interpretation = `<div class="cce-insight-box insight-surplus">
          <h4><i data-icon="check-circle"></i> Autofinanciamiento con proveedores: ${fmt.plain(Math.abs(cce), 1)} días</h4>
          <p>La empresa cobra a sus clientes <strong>${fmt.plain(Math.abs(cce), 1)} días antes</strong> de tener que desembolsar el pago a sus proveedores. Los proveedores financian gratuitamente el 100% del ciclo operativo, generando un fondo de maniobra temporalmente disponible en caja.</p>
        </div>`;
      } else {
        interpretation = `<div class="cce-insight-box insight-bal">
          <h4><i data-icon="check-circle"></i> Ciclo equilibrado (0 días)</h4>
          <p>El cobro a clientes coincide en el tiempo con la obligación de pago a proveedores. No se genera brecha neta de financiamiento ni excedente.</p>
        </div>`;
      }
    } else {
      interpretation = `<p class="note">Completa las ventas a crédito y las compras a crédito estimadas para desbloquear la interpretación financiera.</p>`;
    }

    // Period Comparison Block
    let comparisonBlock = '';
    const priorCCE = r.previous?.activity?.cce;
    if (Number.isFinite(priorCCE) && valid) {
      const diff = cce - priorCCE;
      const improved = diff < 0;
      comparisonBlock = `<div class="cce-comparison-card">
        <h4>Comparación con período anterior (${esc(c.periods.previous)} vs. ${esc(c.periods.current)})</h4>
        <div class="cce-comp-row">
          <span>${esc(c.periods.previous)}: <strong>${fmt.plain(priorCCE, 1)} días</strong></span>
          <span>${esc(c.periods.current)}: <strong>${fmt.plain(cce, 1)} días</strong></span>
          <span class="badge ${improved ? 'badge-green' : 'badge-amber'}">${improved ? 'Mejora en ' + fmt.plain(Math.abs(diff), 1) + ' días' : 'Aumento de brecha en ' + fmt.plain(diff, 1) + ' días'}</span>
        </div>
      </div>`;
    } else {
      comparisonBlock = `<p class="table-footnote">Comparación histórica: ${Number.isFinite(priorCCE) ? 'Disponible.' : 'El período anterior requiere un balance inicial adicional para calcular el saldo promedio y rotación.'}</p>`;
    }

    const body = `<div class="panel-body">
      <div id="cce-top" class="cce-header-meta">
        <p>Base anual: 365 días. El período ${esc(c.periods.current)} calcula la actividad con los saldos promedio de los balances ${esc(c.periods.previous)} y ${esc(c.periods.current)}.</p>
      </div>

      ${kpis}
      ${timelineGraphic}
      ${interpretation}
      ${comparisonBlock}

      <form id="cce-premises" class="form-grid cce-premises-form">
        <label class="field">
          <span class="field-label">Ventas a crédito del período (dejar vacío para usar ventas netas del estado)</span>
          <input class="input" type="number" min="0" step="any" name="creditSales" value="${esc(cfg.creditSales??'')}">
        </label>
        <label class="field">
          <span class="field-label">Compras a crédito estimadas (% del costo; dejar vacío para usar 100%)</span>
          <input class="input" type="number" min="0" max="100" step="any" name="purchaseRate" value="${esc(cfg.purchaseRate??'')}">
        </label>
        <div class="cce-form-actions">
          <button class="button button-primary" type="submit">Guardar premisas CCE</button>
        </div>
        <p id="cce-error" role="alert"></p>
      </form>
      <p class="note">${esc(a?.creditSource||'Ventas a crédito pendientes')} · ${esc(a?.purchaseSource||'Compras a crédito pendientes')}. Las premisas son independientes y se guardan por empresa.</p>
    </div>`;

    return `<div id="cce">${panel('Ciclo de Conversión de Efectivo (CCE)', 'Cronología financiera de inventario, cobro a clientes y pago a proveedores', body)}</div>`;
  }
  $('panel-ratios').addEventListener('submit',event=>{
    if(event.target.id!=='cce-premises')return;event.preventDefault();const form=event.target,err=form.querySelector('#cce-error');
    const read=name=>form.elements[name].value.trim()===''?null:Number(form.elements[name].value);
    const creditSales=read('creditSales'),purchaseRate=read('purchaseRate'),c=C.store.active(),income=C.analyzeIncome(c).statements.current;
    if((creditSales!==null&&(!Number.isFinite(creditSales)||creditSales<0||(Number.isFinite(income?.sales)&&creditSales>income.sales)))||(purchaseRate!==null&&(!Number.isFinite(purchaseRate)||purchaseRate<0||purchaseRate>100))){err.textContent='Revisa las ventas a crédito (no pueden superar las ventas totales) y el porcentaje de compras (0 a 100).';return;}
    c.params||={};c.params.academicAnalysis||={};c.params.academicAnalysis.current={creditSales,purchaseRate};
    const saved=C.store.save(c);if(!saved)window.Finora.toast('No se pudo guardar; las premisas solo permanecen en memoria.');else window.Finora.toast('Premisas guardadas.');
  });

  // ---------- Comprobaciones ----------
  function renderChecks(c, b, i) {
    const ch = C.checks(c, b, i);
    const state = ok => ok === null ? '<span class="muted">—</span>' : ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-amber">REVISAR</span>';
    const rows = ch.items.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.period)}</td><td>${x.reported === null ? '—' : num(x.reported)}</td><td>${x.calculated === null ? '—' : num(x.calculated)}</td><td>${x.difference === null ? '—' : num(x.difference)}</td><td>${state(x.ok)}</td><td class="note-cell">${esc(x.note || '')}</td></tr>`).join('');
    $('panel-checks').innerHTML = panel('Comprobaciones del balance', 'Totales del documento contra la suma de cuentas, ecuación contable y datos incompletos.',
      `<div class="table-scroll"><table class="account-table checks-table"><thead><tr><th scope="col">Comprobación</th><th scope="col">Período</th><th scope="col">Importe reportado</th><th scope="col">Importe calculado</th><th scope="col">Diferencia</th><th scope="col">Estado</th><th scope="col">Observación</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="checks-summary"><span>Observaciones a revisar: <strong>${ch.pending}</strong></span><span>Estado general: ${ch.ok ? '<span class="badge badge-green">OK</span>' : '<span class="badge badge-amber">REQUIERE REVISIÓN</span>'}</span></div>`,
      `<span class="badge ${ch.ok ? 'badge-green' : 'badge-amber'}">${ch.ok ? 'Todo cuadra' : `${ch.pending} por revisar`}</span>`);
  }

  // ---------- Indicadores destacados ----------
  function renderStats(c, b, i) {
    const p = c.periods, ind = C.indicators(c, b, i);
    const safe = pair => { try { return F.compareValues(pair.previous ?? null, pair.current ?? null); } catch (_) { return null; } };
    const trend = (cmp, text) => cmp && cmp.relative !== null && cmp.relative !== undefined ? `<span class="trend ${cmp.relative >= 0 ? 'trend-positive' : 'trend-negative'}"><i data-icon="${cmp.relative >= 0 ? 'arrow-up-right' : 'arrow-down-right'}"></i>${fmt.signedPct(cmp.relative)}</span> ${text}` : esc(text);
    const card = (label, iconName, value, caption) => `<article class="stat-card"><div class="stat-topline"><span class="stat-label">${label}</span><span class="mini-icon"><i data-icon="${iconName}"></i></span></div><p class="stat-value">${value}</p><p class="stat-caption">${caption}</p></article>`;
    const money = v => `<span class="stat-currency">${esc(c.currency)}</span>${fmt.plain(v)}`;
    const share = ind.liabilitiesShare;
    let last;
    if (!i.empty && i.statements.current) {
      const net = { previous: i.statements.previous?.netProfit ?? null, current: i.statements.current.netProfit };
      last = card('Utilidad neta', 'trend', money(net.current), ind.margins ? `Margen sobre utilidad neta ${fmt.pct(ind.margins.net.current)} · ${trend(safe(net), `vs. ${esc(p.previous)}`)}` : '');
    } else last = card('Total capital', 'scale', money(b.totals.equity.current), trend(safe(b.totals.equity), `vs. ${esc(p.previous)}`));
    $('analysis-stats').innerHTML = card(`Total activos ${esc(p.current)}`, 'grid', money(b.totals.assets.current), trend(safe(b.totals.assets), `vs. ${esc(p.previous)}`))
      + card('Capital de trabajo neto', 'wallet', money(ind.workingCapital.values.current), trend(ind.workingCapital, `vs. ${esc(p.previous)}`))
      + card('Participación del pasivo', 'bank', `${fmt.plain((share.current ?? 0) * 100)}<span class="value-suffix">%</span>`, share.previous !== null && share.current !== null ? `<span class="trend ${share.current <= share.previous ? 'trend-positive' : 'trend-negative'}">${fmt.pp(share.current - share.previous)}</span> vs. ${esc(p.previous)}` : '')
      + last;
  }

  // ---------- Montaje ----------
  // Sin ningún documento ingresado no hay nada que analizar: se invita a empezar por Estados financieros.
  const analysisParts = () => ['case-bar', 'analysis-stats'].map($).concat(Array.from(document.querySelectorAll('.analysis-tabs, [role="tabpanel"]')));
  function renderStart() {
    let notice = $('start-notice');
    if (!notice) {
      notice = document.createElement('section');
      notice.className = 'panel'; notice.id = 'start-notice';
      notice.innerHTML = `<div class="empty-panel"><h3>Empieza por tu documento</h3><p>Pega el balance general o el estado de resultados en Estados financieros. Finora clasifica las cuentas y aquí verás el análisis vertical y horizontal, los indicadores, la interpretación y las recomendaciones.</p><a class="button button-primary" href="../estados-financieros/index.html"><i data-icon="file"></i>Ingresar un documento</a></div>`;
      $('case-bar').before(notice);
    }
    hydrateIcons(notice);
  }
  function render() {
    const started = C.store.started();
    analysisParts().forEach(el => { if (el && !el.matches('[role="tabpanel"]')) el.hidden = !started; });
    if (!started) { renderStart(); document.querySelectorAll('[role="tabpanel"]').forEach(el => { el.hidden = true; }); return; }
    $('start-notice')?.remove();
    if (!document.querySelector('[role="tabpanel"]:not([hidden])')) selectTab(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
    const c = C.store.active();
    const b = C.analyzeBalance(c), i = C.analyzeIncome(c);
    renderStats(c, b, i); renderBalance(c, b); renderIncome(c, i); renderCharts(c, b, i); renderReading(c, b, i); renderAdvice(c, b, i); renderRatios(c, b, i); renderChecks(c, b, i);
    $('tab-income').classList.toggle('tab-muted', i.empty);
    const pending = C.checks(c, b, i).pending;
    $('tab-checks').textContent = pending ? `Comprobaciones (${pending})` : 'Comprobaciones';
    hydrateIcons(document.querySelector('.main-content'));
  }

  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  function selectTab(tab, focus = false) {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $(t.getAttribute('aria-controls')).hidden = !on; });
    if (focus) tab.focus();
    try { sessionStorage.setItem('finora:analisis-tab', tab.dataset.tab); } catch (_) { /* opcional */ }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      selectTab(tabs[(keys[event.key] + tabs.length) % tabs.length], true);
    });
  });
  let initial = tabs[0];
  const params = new URLSearchParams(window.location.search);
  const targetTab = params.get('tab') || (window.location.hash === '#cce' ? 'ratios' : null);
  if (targetTab) {
    const matched = tabs.find(t => t.dataset.tab === targetTab);
    if (matched) initial = matched;
  } else {
    try { initial = tabs.find(t => t.dataset.tab === sessionStorage.getItem('finora:analisis-tab')) || initial; } catch (_) { /* sin preferencia */ }
  }
  selectTab(initial);

  if (window.location.hash === '#cce') {
    setTimeout(() => {
      const el = $('cce');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  $('print-analysis').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount($('case-bar'));
  C.store.subscribe(render);
  window.addEventListener('pageshow', event => { if (event.persisted) C.store.reload(); });
  render();
})();
