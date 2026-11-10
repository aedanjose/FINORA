'use strict';
(() => {
  const C = window.FinoraCasos, L = window.FinoraLeverage, { esc } = window.FinoraCaseBar;
  let activeData = null, activeScenario = 'base';
  let activeSource = new URLSearchParams(window.location.search).get('source') === 'proforma' ? 'proforma' : 'historical';
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const money = value => C.fmt.money(value, activeData);
  const times = value => Number.isFinite(value) ? value.toFixed(2) : '—';
  function render() {
    const c = C.store.active();
    activeData = L.analyze(c, activeSource);
    const d = activeData, pending = d.unavailable;
    document.querySelectorAll('[data-source]').forEach(btn => {
      const selected = btn.dataset.source === activeSource;
      btn.classList.toggle('active', selected); btn.setAttribute('aria-pressed', String(selected));
    });
    set('leverage-mode-badge', (d.isSample ? 'Ejemplo · ' : '') + (activeSource === 'proforma' ? 'Proforma' : 'Histórico') + ' · ' + d.companyName);
    set('leverage-period-label', d.period ? 'Período: ' + d.period : 'Período pendiente');
    set('leverage-currency-caption', 'Cifras en ' + C.fmt.unit(c));
    set('leverage-projection-name', activeSource === 'proforma' ? d.projectionName : 'Estado de resultados actual');
    const notice = document.getElementById('leverage-empty-notice');
    const messages = [d.reason, ...d.warnings].filter(Boolean);
    notice.style.display = messages.length ? 'block' : 'none';
    notice.textContent = messages.join(' ');
    set('leverage-assumption', pending ? 'Los datos pendientes se muestran como —.' : d.assumption);
    for (const key of ['gao','gaf','gat']) {
      set(key + '-val', Number.isFinite(d[key]) ? times(d[key]) + ' veces' : '—');
      set(key + '-desc', pending ? 'Completa los datos del origen seleccionado.' : d[key] === null ? d.metricReasons[key]
        : d[key] < 0 ? 'Grado negativo por la estructura de pérdidas; revisa los importes del escenario.'
        : key === 'gao' ? 'Por cada 1% en ventas, la utilidad operativa varía ' + times(d[key]) + '%.'
        : key === 'gaf' ? 'Por cada 1% en utilidad operativa, la utilidad antes de impuestos varía ' + times(d[key]) + '%.'
        : 'Por cada 1% en ventas, la utilidad antes de impuestos varía ' + times(d[key]) + '%.');
    }
    set('gao-formula', pending ? '—' : money(d.cm) + ' / ' + money(d.ebit));
    set('gaf-formula', pending ? '—' : money(d.ebit) + ' / ' + money(d.ebt));
    set('gat-formula', pending ? '—' : times(d.gao) + ' × ' + times(d.gaf));
    for (const [id, value] of Object.entries({sales:d.sales,vc:pending?null:-d.vc,cm:d.cm,fc:pending?null:-d.fc,
      ebit:d.ebit,interest:pending?null:-d.interest,other:d.otherNet,ebt:d.ebt})) set('bd-' + id, money(value));
    set('bd-vc-rate', d.variableRatio === null ? '—' : C.fmt.pct(d.variableRatio, 1) + ' de ventas');
    document.querySelectorAll('[data-scenario], [data-leverage-detail]').forEach(btn => { btn.disabled = pending; });
    document.getElementById('show-lower-scenario').disabled = pending;
    applyScenario(activeScenario);
    window.Finora.hydrateIcons();
  }
  function applyScenario(key) {
    activeScenario = key;
    const r = L.scenario(activeData, key === 'lower' ? -10 : key === 'higher' ? 10 : 0);
    document.querySelectorAll('[data-scenario]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.scenario === key)));
    for (const [id, field] of [['sales','sales'],['operating','ebit'],['pretax','ebt']]) {
      const pct = r?.changes[field].relative ?? null;
      set(id + '-change', C.fmt.signedPct(pct, 1));
      document.getElementById(id + '-bar').style.width = pct === null ? '0%' : Math.min(100, Math.abs(pct) * 280) + '%';
    }
    document.querySelector('.sensitivity-chart').classList.toggle('is-negative', key === 'lower');
    if (!r) { set('scenario-description', 'Completa los datos del origen seleccionado para calcular escenarios.'); return; }
    const change = k => r.changes[k].relative === null
      ? 'cambio absoluto: ' + money(r.changes[k].absolute) + '; porcentaje no definido con base cero o negativa'
      : C.fmt.signedPct(r.changes[k].relative, 1);
    set('scenario-description', 'Ventas: ' + money(r.sales) + ' (' + change('sales') + '). Utilidad operativa: ' + money(r.ebit) + ' (' + change('ebit') + '). Utilidad antes de impuestos: ' + money(r.ebt) + ' (' + change('ebt') + ').');
  }
  document.querySelectorAll('[data-source]').forEach(btn => btn.addEventListener('click', () => {
    activeSource = btn.dataset.source; render();
  }));
  document.querySelectorAll('[data-scenario]').forEach(btn => btn.addEventListener('click', () => applyScenario(btn.dataset.scenario)));
  document.getElementById('show-lower-scenario').addEventListener('click', () => {
    applyScenario('lower'); document.querySelector('[data-scenario="lower"]').focus();
  });
  document.querySelectorAll('[data-leverage-detail]').forEach(btn => btn.addEventListener('click', () => {
    if (!activeData || activeData.unavailable) return;
    const d = activeData, key = btn.dataset.leverageDetail;
    const formula = key === 'gao' ? 'Margen de contribución / utilidad operativa'
      : key === 'gaf' ? 'Utilidad operativa / utilidad antes de impuestos' : 'GAO × GAF';
    const operands = key === 'gao' ? money(d.cm) + ' / ' + money(d.ebit)
      : key === 'gaf' ? money(d.ebit) + ' / ' + money(d.ebt) : times(d.gao) + ' × ' + times(d.gaf);
    window.Finora.openDialog('Apalancamiento · ' + key.toUpperCase(),
      '<p><strong>' + esc(formula) + '</strong></p><p>' + esc(operands) + ' = ' + times(d[key]) + ' veces.</p><p>' + esc(d[key] === null ? d.metricReasons[key] : d.assumption) + '</p><p>Cifras en ' + esc(C.fmt.unit(d)) + '.</p>');
  }));
  document.getElementById('leverage-guide').addEventListener('click', () => window.Finora.openDialog('Cómo leer el apalancamiento',
    '<p><strong>GAO</strong>: sensibilidad de la utilidad operativa ante cambios en ventas.</p><p><strong>GAF</strong>: sensibilidad de la utilidad antes de impuestos ante cambios operativos.</p><p><strong>GAT</strong>: efecto combinado hasta la utilidad antes de impuestos.</p><p>La proyección utiliza el mismo presupuesto guardado que Estados Proforma. Los históricos respetan la clasificación de Punto de equilibrio. Una base cero deja la razón sin definir; las pérdidas conservan el signo.</p><p>La sensibilidad mantiene constantes los costos fijos, los intereses y otros resultados. No modifica la proyección ni calcula préstamos.</p>'));
  window.FinoraCaseBar.mount(document.getElementById('case-bar'));
  C.store.subscribe(render); render();
})();
