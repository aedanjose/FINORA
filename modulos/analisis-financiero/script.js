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
      items.length ? `<ol class="insight-list">${items.map(x => `<li><strong>${esc(x.topic)}</strong><p>${esc(x.text)}</p></li>`).join('')}</ol>` : empty('Faltan datos', 'La interpretación necesita el balance de los dos períodos.'));
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
    const r = C.ratios(c, b, i), p = c.periods;
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
        const formula = String(m?.formula || '').replace(/ promedio/g, ' al cierre');
        return `<tr><td>${label}</td><td class="formula">${esc(formula)}</td><td>${metricText(get('previous', path), c)}</td><td>${metricText(get('current', path), c)}</td></tr>`;
      }).join('');
    }).join('');
    const table = `<div class="table-scroll"><table class="account-table ratio-table"><thead><tr><th scope="col">Razón</th><th scope="col">Fórmula</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="table-footnote">Calculadas por el motor con los saldos al cierre de cada período${c.params?.allSalesCredit ? '; se supone que todas las ventas son a crédito' : ''}. Pasa el cursor sobre «—» para ver qué dato falta.</p>`;
    let dupont = empty('DuPont necesita el estado de resultados', 'Con ventas y utilidad neta se descompone el ROE en margen, rotación y multiplicador de capital.');
    const d = r.current?.profitability?.dupont;
    if (d && d.roe?.value !== null && d.roe?.value !== undefined) {
      dupont = `<div class="panel-body"><div class="dupont-flow"><div class="dupont-factor"><span>Margen neto</span><strong>${fmt.pct(d.margin.value)}</strong><small>Utilidad neta / ventas</small></div><span class="math-symbol">×</span><div class="dupont-factor"><span>Rotación de activos</span><strong>${fmt.plain(d.turnover.value, 3)}</strong><small>Ventas / activos</small></div><span class="math-symbol">×</span><div class="dupont-factor"><span>Multiplicador de capital</span><strong>${fmt.plain(d.leverage.value, 3)}</strong><small>Activos / capital</small></div><span class="math-symbol">=</span><div class="dupont-result"><span>ROE ${esc(p.current)}</span><strong>${fmt.pct(d.roe.value)}</strong><small>Rendimiento del capital</small></div></div>
        <p class="note">Cada ${esc(c.currency)} 100 de capital generó ${esc(c.currency)} ${fmt.plain(d.roe.value * 100)} de utilidad neta en ${esc(p.current)}. Se usan los saldos de activos y capital al cierre.</p></div>`;
    }
    $('panel-ratios').innerHTML = panel('Razones financieras', `${esc(p.previous)} y ${esc(p.current)}`, table) + panel('Modelo DuPont', `Los tres motores del ROE · ${esc(p.current)}`, dupont);
  }

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
      last = card('Utilidad neta', 'trend', money(net.current), ind.margins ? `Margen neto ${fmt.pct(ind.margins.net.current)} · ${trend(safe(net), `vs. ${esc(p.previous)}`)}` : '');
    } else last = card('Total capital', 'scale', money(b.totals.equity.current), trend(safe(b.totals.equity), `vs. ${esc(p.previous)}`));
    $('analysis-stats').innerHTML = card(`Total activos ${esc(p.current)}`, 'grid', money(b.totals.assets.current), trend(safe(b.totals.assets), `vs. ${esc(p.previous)}`))
      + card('Capital de trabajo neto', 'wallet', money(ind.workingCapital.values.current), trend(ind.workingCapital, `vs. ${esc(p.previous)}`))
      + card('Participación del pasivo', 'bank', `${fmt.plain((share.current ?? 0) * 100)}<span class="value-suffix">%</span>`, share.previous !== null && share.current !== null ? `<span class="trend ${share.current <= share.previous ? 'trend-positive' : 'trend-negative'}">${fmt.pp(share.current - share.previous)}</span> vs. ${esc(p.previous)}` : '')
      + last;
  }

  // ---------- Montaje ----------
  function render() {
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
  try { initial = tabs.find(t => t.dataset.tab === sessionStorage.getItem('finora:analisis-tab')) || initial; } catch (_) { /* sin preferencia */ }
  selectTab(initial);

  $('print-analysis').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount($('case-bar'));
  C.store.subscribe(render);
  window.addEventListener('pageshow', event => { if (event.persisted) C.store.reload(); });
  render();
})();
