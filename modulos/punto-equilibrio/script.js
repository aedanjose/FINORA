/* Punto de equilibrio conectado a la empresa activa. Las cifras salen de break-even.js (motor); aquí solo se presentan. */
(() => {
  'use strict';
  const C = window.FinoraCasos, B = window.FinoraBreakEven, { fmt } = C;
  const { hydrateIcons } = window.Finora;
  const esc = window.FinoraCaseBar.esc;
  const $ = id => document.getElementById(id);
  let side = 'current';

  const panel = (title, subtitle, body, extra = '') => `<article class="panel"><div class="panel-header"><div><h2 class="panel-title">${title}</h2>${subtitle ? `<p class="panel-subtitle">${subtitle}</p>` : ''}</div>${extra}</div>${body}</article>`;
  const empty = (title, text, href, label) => `<article class="panel"><div class="empty-panel"><h3>${title}</h3><p>${text}</p>${href ? `<a class="button button-primary" href="${href}"><i data-icon="file"></i>${label}</a>` : ''}</div></article>`;
  // Ejes abreviados con el mismo formato numérico de Finora (punto decimal): 187.5 mil, 1.2 M.
  const compact = v => { const a = Math.abs(v), n = (x, u) => `${+(x).toFixed(1)} ${u}`.replace(/^(-?\d+)\.0 /, '$1 '); return a >= 1e6 ? n(v / 1e6, 'M') : a >= 1e3 ? n(v / 1e3, 'mil') : fmt.plain(v, 0); };

  // ---------- Gráfica costo-volumen-utilidad ----------
  function niceCeil(v) { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p * 2) / 2 * p; }
  function chart(r, c) {
    const W = 660, H = 320, L = 74, R = 24, T = 22, Bm = 44;
    const v = r.sales > 0 ? r.variableCosts / r.sales : 0, F = r.fixedCosts;
    const xMax = niceCeil(Math.max(r.sales, r.breakEvenSales || 0) * 1.3);
    const yMax = niceCeil(Math.max(xMax, F + v * xMax));
    const x = s => L + s / xMax * (W - L - R), y = s => H - Bm - s / yMax * (H - T - Bm);
    const ticks = n => Array.from({ length: n + 1 }, (_, i) => i / n);
    let svg = ticks(4).map(t => `<line class="be-grid" x1="${L}" x2="${W - R}" y1="${y(t * yMax)}" y2="${y(t * yMax)}"/><text class="be-axis" x="${L - 8}" y="${y(t * yMax) + 4}" text-anchor="end">${compact(t * yMax)}</text>`).join('');
    svg += ticks(5).map(t => `<text class="be-axis" x="${x(t * xMax)}" y="${H - Bm + 18}" text-anchor="middle">${compact(t * xMax)}</text>`).join('');
    svg += `<text class="be-axis" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Ventas (${esc(fmt.unit(c) || 'importe')})</text>`;
    const be = r.breakEvenSales;
    if (be !== null && be > 0 && be < xMax) {
      svg += `<polygon class="be-loss" points="${x(0)},${y(0)} ${x(be)},${y(be)} ${x(0)},${y(F)}"/>`;
      svg += `<polygon class="be-profit" points="${x(be)},${y(be)} ${x(xMax)},${y(xMax)} ${x(xMax)},${y(F + v * xMax)}"/>`;
    }
    svg += `<line class="be-fixed" x1="${x(0)}" x2="${x(xMax)}" y1="${y(F)}" y2="${y(F)}"/>`;
    svg += `<line class="be-cost" x1="${x(0)}" y1="${y(F)}" x2="${x(xMax)}" y2="${y(F + v * xMax)}"/>`;
    svg += `<line class="be-revenue" x1="${x(0)}" y1="${y(0)}" x2="${x(xMax)}" y2="${y(xMax)}"/>`;
    svg += `<line class="be-actual" x1="${x(r.sales)}" x2="${x(r.sales)}" y1="${y(0)}" y2="${y(r.sales)}"/><text class="be-actual-label" x="${x(r.sales) + 6}" y="${y(r.sales) - 8}">Ventas ${esc(r.period)}</text>`;
    if (be !== null && be > 0 && be < xMax) svg += `<circle class="be-point" cx="${x(be)}" cy="${y(be)}" r="6"><title>Punto de equilibrio: ${fmt.money(be, c)}</title></circle><text class="be-point-label" x="${x(be) - 10}" y="${y(be) - 14}" text-anchor="end">Equilibrio ${esc(fmt.money(be, c))}</text>`;
    const label = `Gráfica costo-volumen-utilidad de ${r.period}: ingresos y costos totales${be !== null ? `; se cruzan en ventas de ${fmt.money(be, c)}` : ''}. Ventas reales ${fmt.money(r.sales, c)}.`;
    return `<figure class="be-figure"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${svg}</svg>
      <ul class="be-legend"><li><span class="be-key be-key-revenue"></span>Ingresos</li><li><span class="be-key be-key-cost"></span>Costos totales</li><li><span class="be-key be-key-fixed"></span>Costos fijos</li><li><span class="be-key be-key-loss"></span>Pérdida</li><li><span class="be-key be-key-profit"></span>Utilidad</li></ul></figure>`;
  }

  // ---------- Bloques ----------
  function stats(r, c) {
    const card = (label, icon, value, caption, dark = false) => `<article class="stat-card${dark ? ' dark' : ''}"><div class="stat-topline"><span class="stat-label">${label}</span><span class="mini-icon"><i data-icon="${icon}"></i></span></div><p class="stat-value">${value}</p><p class="stat-caption">${caption}</p></article>`;
    const money = v => v === null ? '—' : `<span class="stat-currency">${esc(c.currency)}</span>${fmt.plain(v)}`;
    const pctValue = v => v === null ? '—' : `${fmt.plain(v * 100)}<span class="value-suffix">%</span>`;
    const beShare = r.breakEvenSales !== null && r.sales > 0 ? `${fmt.pct(r.breakEvenSales / r.sales)} de las ventas de ${esc(r.period)}` : esc(r.breakEvenReason || 'Sin margen de contribución positivo');
    return `<section class="stats-grid" aria-label="Resultados de ${esc(r.period)}">
      ${card('Ventas de equilibrio', 'scale', money(r.breakEvenSales), beShare, true)}
      ${card('Razón de contribución', 'trend', pctValue(r.contributionRatio), r.contributionRatio === null ? '' : `Cada ${esc(c.currency)} 100 vendidos aportan ${esc(c.currency)} ${fmt.plain(r.contributionRatio * 100)} para cubrir costos fijos`)}
      ${card('Margen de seguridad', 'wallet', pctValue(r.safetyMargin), r.safetyAmount === null ? '' : r.safetyAmount >= 0 ? `Las ventas pueden bajar ${esc(fmt.money(r.safetyAmount, c))} antes de perder` : `Faltan ${esc(fmt.money(-r.safetyAmount, c))} de ventas para no perder`)}
      ${card('Utilidad operativa', 'chart', money(r.ebit), 'UAII: margen de contribución − costos fijos')}
    </section>`;
  }

  function costTable(c, r) {
    const lines = B.costLines(c);
    const group = category => {
      const rows = lines.filter(l => l.category === category);
      if (!rows.length) return '';
      return `<tr class="row-group"><td colspan="4">${esc(B.COST_CATEGORIES[category] === 'Costo de ventas' ? 'Costo de ventas' : 'Gastos operativos')}</td></tr>` + rows.map(l => {
        const amount = l.amounts[side];
        const toggle = ['variable', 'fixed'].map(b => `<button type="button" class="be-toggle" data-behavior="${b}" data-account="${esc(l.id)}" aria-pressed="${l.behavior === b}">${b === 'fixed' ? 'Fijo' : 'Variable'}</button>`).join('');
        const origin = l.chosen ? '<span class="be-origin chosen">Elegido</span>' : `<span class="be-origin${l.doubtful ? ' doubtful' : ''}" title="${esc(l.proposal.reason)}">${l.doubtful ? 'Revisar' : 'Propuesto'}</span>`;
        return `<tr class="row-account${l.doubtful ? ' be-doubtful' : ''}"><td>${esc(l.name)}${!l.chosen ? `<span class="be-reason">${esc(l.proposal.reason)}</span>` : ''}</td><td>${amount === null ? '—' : fmt.number(l.sign * amount)}</td><td><span class="be-toggles" role="group" aria-label="Comportamiento de ${esc(l.name)}">${toggle}</span></td><td>${origin}</td></tr>`;
      }).join('');
    };
    const totals = r.ok ? `<tr class="row-subtotal"><td>Costos variables</td><td>${fmt.number(r.variableCosts)}</td><td colspan="2"></td></tr><tr class="row-subtotal"><td>Costos fijos</td><td>${fmt.number(r.fixedCosts)}</td><td colspan="2"></td></tr>` : '';
    const anyChosen = lines.some(l => l.chosen);
    return panel('¿Qué costos son fijos y cuáles variables?', 'Finora propone el comportamiento de cada costo por su nombre. Cámbialo si no corresponde: el cálculo se actualiza al instante.',
      `<div class="table-scroll"><table class="account-table be-costs"><thead><tr><th scope="col">Cuenta</th><th scope="col">${esc(r.period)}</th><th scope="col">Comportamiento</th><th scope="col">Origen</th></tr></thead><tbody>${group('costSales')}${group('opex')}${totals}</tbody></table></div>
      <p class="table-footnote">Variable: cambia en proporción a lo vendido (costo de la mercadería, comisiones, fletes). Fijo: se paga aunque no se venda (alquiler, sueldos administrativos, depreciación). Los gastos financieros y los impuestos no entran en el punto de equilibrio operativo.</p>`,
      anyChosen ? '<button type="button" class="button button-secondary button-small" id="be-reset">Usar las propuestas</button>' : '');
  }

  function formula(r, c) {
    const m = v => esc(fmt.money(v, c));
    const steps = [
      ['Margen de contribución', 'Ventas − costos variables', `${m(r.sales)} − ${m(r.variableCosts)} = <strong>${m(r.contribution)}</strong>`],
      ['Razón de contribución', 'Margen de contribución ÷ ventas', `${m(r.contribution)} ÷ ${m(r.sales)} = <strong>${fmt.pct(r.contributionRatio)}</strong>`],
      ['Punto de equilibrio', 'Costos fijos ÷ razón de contribución', r.breakEvenSales === null ? esc(r.breakEvenReason) : `${m(r.fixedCosts)} ÷ ${fmt.pct(r.contributionRatio)} = <strong>${m(r.breakEvenSales)}</strong>`],
      ['Margen de seguridad', '(Ventas − punto de equilibrio) ÷ ventas', r.safetyMargin === null ? '—' : `(${m(r.sales)} − ${m(r.breakEvenSales)}) ÷ ${m(r.sales)} = <strong>${fmt.pct(r.safetyMargin)}</strong>`]
    ];
    return panel('Cómo se calcula', `Con las cifras de ${esc(r.period)}`, `<ol class="be-steps">${steps.map(([t, f, v]) => `<li><span class="be-step-title">${t}</span><span class="be-step-formula">${f}</span><span class="be-step-value">${v}</span></li>`).join('')}</ol>
      ${r.costSalesFullyVariable ? '<p class="note">Todo el costo de ventas se toma como variable. Si incluye costos fijos (por ejemplo, depreciación de la planta), márcalos como «Fijo» en la tabla de costos.</p>' : ''}`);
  }

  function unitsPanel(r, c) {
    const s = B.settingsFor(c);
    const body = r.units ? `<dl class="be-units"><div><dt>Unidades vendidas (estimadas)</dt><dd>${fmt.plain(r.units.sold, 0)}</dd></div><div><dt>Costo variable por unidad</dt><dd>${esc(fmt.money(r.units.variableCostPerUnit, c))}</dd></div><div><dt>Unidades de equilibrio</dt><dd>${r.units.breakEven === null ? '—' : `${fmt.plain(r.units.breakEven, 1)} <small>(${fmt.plain(r.units.breakEvenWhole, 0)} enteras)</small>`}</dd></div></dl>`
      : '<p class="be-units-hint">Si la empresa vende un solo producto (o un precio promedio representativo), escribe su precio para ver el equilibrio en unidades.</p>';
    return panel('En unidades', 'Opcional', `<div class="panel-body"><label class="field be-price"><span class="field-label">Precio de venta por unidad (${esc(c.currency || '')})</span><input class="input" id="be-unit-price" inputmode="decimal" autocomplete="off" value="${s.unitPrice ? esc(s.unitPrice.toLocaleString('en-US', { maximumFractionDigits: 6 })) : ''}" placeholder="Ej. 50"></label><p class="import-error" id="be-price-error" role="alert"></p>${body}</div>`);
  }

  function comparison(both, c) {
    const p = c.periods, a = both.previous, b = both.current;
    const row = (label, key, kind = 'money') => {
      const show = v => v === null || v === undefined ? '—' : kind === 'pct' ? fmt.pct(v) : fmt.number(v);
      return `<tr><td>${label}</td><td>${show(a[key])}</td><td>${show(b[key])}</td></tr>`;
    };
    return panel('Comparación entre años', 'Mismo criterio de costos fijos y variables en los dos períodos',
      `<div class="table-scroll"><table class="account-table"><thead><tr><th scope="col">Concepto</th><th scope="col">${esc(p.previous)}</th><th scope="col">${esc(p.current)}</th></tr></thead><tbody>
      ${row('Ventas', 'sales')}${row('Costos variables', 'variableCosts')}${row('Margen de contribución', 'contribution')}${row('Razón de contribución', 'contributionRatio', 'pct')}${row('Costos fijos', 'fixedCosts')}${row('Utilidad operativa (UAII)', 'ebit')}
      <tr class="row-total"><td>Punto de equilibrio</td><td>${a.breakEvenSales === null ? '—' : fmt.number(a.breakEvenSales)}</td><td>${b.breakEvenSales === null ? '—' : fmt.number(b.breakEvenSales)}</td></tr>${row('Margen de seguridad', 'safetyMargin', 'pct')}
      </tbody></table></div>`);
  }

  // ---------- Montaje ----------
  function render() {
    const content = $('be-content');
    if (!C.store.started()) { content.innerHTML = empty('Empieza por tu documento', 'Pega el estado de resultados de la empresa en Estados financieros y aquí verás su punto de equilibrio.', '../estados-financieros/index.html', 'Ingresar un documento'); $('case-bar').hidden = true; hydrateIcons(content); return; }
    $('case-bar').hidden = false;
    const c = C.store.active(), both = B.analyzeBoth(c);
    if (!both[side].ok && both[side === 'current' ? 'previous' : 'current'].ok) side = side === 'current' ? 'previous' : 'current';
    const r = both[side];
    if (!r.ok) {
      const noIncome = !(c.income || []).some(a => C.SIDES.some(s => Number.isFinite(a.amounts?.[s])));
      content.innerHTML = noIncome
        ? empty('Falta el estado de resultados', `${esc(c.name)} solo tiene balance general. El punto de equilibrio necesita sus ventas, costos y gastos. Pega o captura el estado de resultados.`, '../estados-financieros/index.html?estado=resultados', 'Agregar estado de resultados')
        : empty('Faltan datos del estado de resultados', r.error ? esc(r.error) : `Para ${esc(r.period)} falta informar: ${esc(r.missing.join(', '))}.`, '../estados-financieros/index.html?estado=resultados', 'Completar estado de resultados');
      hydrateIcons(content); return;
    }
    const periodSwitch = both.previous.ok && both.current.ok
      ? `<div class="segmented-control be-period" role="group" aria-label="Año">${C.SIDES.map(s => `<button type="button" class="tab-button" data-side="${s}" aria-pressed="${s === side}" aria-selected="${s === side}">${esc(c.periods[s])}</button>`).join('')}</div>` : '';
    const doubts = r.doubtful ? `<div class="status-strip"><span class="status-chip bad"><i data-icon="info"></i>${r.doubtful} ${r.doubtful === 1 ? 'costo tiene' : 'costos tienen'} una clasificación dudosa. Revísalos en la tabla de costos.</span></div>` : '';
    content.innerHTML = `<div class="be-toolbar"><span class="be-caption">${esc(c.name)} · ${esc(r.period)} · Cifras en ${esc(fmt.unit(c) || 'unidades')}</span>${periodSwitch}</div>
      ${doubts}${stats(r, c)}
      <div class="be-layout">${panel('Costo, volumen y utilidad', 'Donde la línea de ingresos cruza la de costos totales, la utilidad operativa es cero.', `<div class="panel-body">${chart(r, c)}</div>`)}${formula(r, c)}</div>
      ${costTable(c, r)}
      <div class="be-layout be-layout-even">${unitsPanel(r, c)}${both.previous.ok && both.current.ok ? comparison(both, c) : ''}</div>
      <p class="note">Supuestos: precios y costo variable por unidad constantes, mezcla de productos estable y costos fijos sin cambios dentro del rango analizado. Los otros ingresos, los gastos financieros y los impuestos quedan fuera del equilibrio operativo.</p>`;
    hydrateIcons(content);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || !$('be-content').contains(button)) return;
    if (button.dataset.side) { side = button.dataset.side; render(); return; }
    if (button.dataset.behavior) {
      const c = C.store.active(), a = c.income.find(x => x.id === button.dataset.account); if (!a) return;
      a.behavior = button.dataset.behavior; C.store.save(c);
      document.querySelector(`[data-account="${CSS.escape(a.id)}"][data-behavior="${a.behavior}"]`)?.focus();
      return;
    }
    if (button.id === 'be-reset') { const c = C.store.active(); c.income.forEach(a => delete a.behavior); C.store.save(c); window.Finora.toast('Se volvieron a usar las propuestas de Finora.'); }
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'be-unit-price') return;
    const text = event.target.value.trim(), value = text ? Number(text.replace(/,/g, '')) : null;
    if (text && !(Number.isFinite(value) && value > 0)) { $('be-price-error').textContent = 'Escribe un precio mayor que cero.'; return; }
    const c = C.store.active();
    if (value) c.breakEven = { ...(c.breakEven || {}), unitPrice: value }; else if (c.breakEven) delete c.breakEven.unitPrice;
    C.store.save(c);
  });
  $('print-break-even').addEventListener('click', () => window.print());
  window.FinoraCaseBar.mount($('case-bar'));
  C.store.subscribe(render);
  window.addEventListener('pageshow', event => { if (event.persisted) C.store.reload(); });
  render();
})();
